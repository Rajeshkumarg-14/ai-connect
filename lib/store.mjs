import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { realpathSync, statSync } from 'node:fs';
import { diagnose } from './diagnostics.mjs';
import { normalizeNotificationState } from './notifications.mjs';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function required(value, label, max = 12000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AppError(`${label} must be between 1 and ${max} characters.`);
  return value.trim();
}
export function choice(value, values, label) {
  if (!values.includes(value)) throw new AppError(`Invalid ${label}. Expected ${values.join(', ')}.`);
  return value;
}
export function projectPath(value) {
  const path = required(value, 'Project path', 2048);
  if (!isAbsolute(path)) throw new AppError('Choose an absolute project directory.');
  try {
    const real = realpathSync(path);
    if (!statSync(real).isDirectory()) throw new Error();
    return real;
  } catch { throw new AppError('The project directory does not exist or cannot be read.'); }
}

export class Store {
  constructor(file, onChange = () => {}) {
    this.file = resolve(file); this.onChange = onChange;
    mkdirSync(dirname(this.file), { recursive: true });
    try { this.data = JSON.parse(readFileSync(this.file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`Cannot load ${this.file}: ${error.message}. Keep the file for recovery; it has not been overwritten.`);
      this.data = { version: 1, rooms: [], agents: [], messages: [], tasks: [], findings: [] };
    }
    if (this.data.version !== 1 || ['rooms', 'agents', 'messages', 'tasks', 'findings'].some(key => !Array.isArray(this.data[key]))) throw new Error('Unsupported or damaged Connect state.');
    normalizeNotificationState(this.data);
    this.data.uploads ??= [];
    this.data.handoffs ??= []; this.data.assistance ??= [];
    for (const agent of this.data.agents) {
      if (agent.status === 'running' || agent.status === 'queued') {
        agent.status = 'stopped'; agent.errorInfo = diagnose('', { provider: agent.provider, kind: 'interrupted' });
      } else if (agent.error && !agent.errorInfo) agent.errorInfo = diagnose(agent.error, { provider: agent.provider, secrets: [agent.capabilityToken] });
      if (agent.errorInfo) {
        agent.error = agent.errorInfo.message;
        agent.failedAt ??= agent.errorInfo.failedAt ?? agent.lastActive ?? null;
        agent.errorInfo.failedAt ??= agent.failedAt;
      }
      if (agent.role === 'bridge' && agent.status !== 'running') {
        agent.bridgeStatus = agent.status === 'error' ? 'error' : 'stopped';
        if (agent.errorInfo) agent.bridgeEvidence = agent.errorInfo.message;
      }
    }
    for (const message of this.data.messages) if (message.dispatch?.recipients) {
      for (const recipient of message.dispatch.recipients) if (['running', 'queued'].includes(recipient.status)) {
        recipient.status = 'failed'; recipient.errorInfo = diagnose('', { kind: 'interrupted', provider: recipient.provider });
      }
      for (const key of ['running', 'queued', 'answered', 'completed', 'relaying', 'skipped', 'errors']) message.dispatch[key] = message.dispatch.recipients.filter(recipient => recipient.status === (key === 'errors' ? 'failed' : key));
    }
    for (const handoff of this.data.handoffs) if (['pending', 'started', 'already_continuing'].includes(handoff.status)) { handoff.status = 'interrupted'; handoff.reason = 'Connect restarted while this handoff was active. Review saved work before explicitly continuing.'; }
    this.save(false);
  }
  snapshot() {
    const copy = structuredClone(this.data);
    for (const agent of copy.agents) delete agent.capabilityToken;
    for (const upload of copy.uploads) delete upload.path;
    return copy;
  }
  save(emit = true) {
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    renameSync(temp, this.file);
    if (emit) this.onChange(this.snapshot());
  }
  get(kind, id) {
    const item = this.data[kind]?.find(item => item.id === id);
    if (!item) throw new AppError(`${kind.slice(0, -1)} was not found.`, 404);
    return item;
  }
  room(id) { return this.get('rooms', id); }
  addRoom(input) {
    const item = { id: randomUUID(), name: required(input.name, 'Room name', 100), path: projectPath(input.path), autoReply: false, failoverEnabled: false, fallbackAgentId: null, approvedPlan: null, maxTurns: 8, turns: 0, createdAt: new Date().toISOString() };
    this.data.rooms.push(item); this.save(); return item;
  }
  updateRoom(id, input) {
    const room = this.room(id);
    const next = { ...room };
    if (input.autoReply !== undefined) { if (typeof input.autoReply !== 'boolean') throw new AppError('autoReply must be boolean.'); next.autoReply = input.autoReply; }
    if (input.maxTurns !== undefined) { if (!Number.isInteger(input.maxTurns) || input.maxTurns < 1 || input.maxTurns > 50) throw new AppError('Turn limit must be between 1 and 50.'); next.maxTurns = input.maxTurns; }
    if (input.resetTurns === true) next.turns = 0;
    if (input.failoverEnabled !== undefined) { if (typeof input.failoverEnabled !== 'boolean') throw new AppError('failoverEnabled must be true or false.'); next.failoverEnabled = input.failoverEnabled; }
    if (input.fallbackAgentId !== undefined) {
      if (input.fallbackAgentId !== null && (this.get('agents', input.fallbackAgentId).roomId !== room.id || this.get('agents', input.fallbackAgentId).external || this.get('agents', input.fallbackAgentId).role === 'bridge')) throw new AppError('Choose a managed coding agent from this room as fallback.');
      next.fallbackAgentId = input.fallbackAgentId;
    }
    Object.assign(room, next);
    this.save(); return room;
  }
  approvePlan(id, input) {
    const room = this.room(id);
    if (input.approve !== true) throw new AppError('Plan approval must be explicitly confirmed by the human.');
    const text = required(input.text, 'Approved plan', 16000);
    room.approvedPlan = { id: randomUUID(), text, hash: createHash('sha256').update(text).digest('hex'), approvedAt: new Date().toISOString() };
    this.save(); return room.approvedPlan;
  }
  addAssistance({ roomId, agentId, question, detail = '', options = [] }) {
    this.room(roomId);
    if (agentId && this.get('agents', agentId).roomId !== roomId) throw new AppError('Agent belongs to another room.', 403);
    if (!Array.isArray(options) || options.length > 6 || options.some(item => typeof item !== 'string' || item.length > 300)) throw new AppError('Assistance options must be up to six short strings.');
    const title = required(question, 'Question for the human', 1000);
    const item = { id: randomUUID(), roomId, agentId: agentId ?? null, title, question: title, detail: String(detail).slice(0, 6000), options, status: 'open', createdAt: new Date().toISOString() };
    this.data.assistance.push(item); this.save(); return item;
  }
  archiveRoom(id, archived) {
    if (typeof archived !== 'boolean') throw new AppError('archived must be true or false.');
    const room = this.room(id); room.archived = archived;
    if (archived) room.autoReply = false;
    this.save(); return room;
  }
  archiveSession(sessionId, archived) {
    if (typeof archived !== 'boolean') throw new AppError('archived must be true or false.');
    required(sessionId, 'Session ID', 160);
    if (!/^(?:claude|codex):[a-zA-Z0-9_-]{6,120}$/.test(sessionId)) throw new AppError('Choose a valid discovered session ID.');
    if (archived) this.data.hiddenSessions[sessionId] = true; else delete this.data.hiddenSessions[sessionId];
    this.save(); return { sessionId, archived, nativeSessionChanged: false };
  }
  deleteRoom(id, confirmName) {
    const room = this.room(id);
    if (confirmName !== room.name) throw new AppError('Type the exact room name to delete this Connect room.');
    const removedAgents = new Set(this.data.agents.filter(a => a.roomId === id).map(a => a.id));
    for (const kind of ['rooms', 'agents', 'messages', 'tasks', 'findings', 'notifications', 'uploads', 'handoffs', 'assistance']) this.data[kind] = this.data[kind].filter(item => kind === 'rooms' ? item.id !== id : item.roomId !== id);
    for (const agentId of removedAgents) delete this.data.settings.notifications.perSession[agentId];
    this.save(); return { deleted: true, roomId: id, nativeSessionsChanged: false, projectFilesChanged: false };
  }
  addAgent(input) {
    this.room(input.roomId);
    const item = { id: randomUUID(), roomId: input.roomId, name: required(input.name, 'Agent name', 80), provider: choice(input.provider, ['claude', 'codex'], 'provider'), role: choice(input.role ?? 'reviewer', ['reviewer', 'builder', 'bridge'], 'role'), status: input.external ? 'external' : 'idle', external: Boolean(input.external), capabilityToken: randomBytes(32).toString('hex'), createdAt: new Date().toISOString() };
    this.data.agents.push(item); this.save(); return item;
  }
  addMessage({ roomId, from = 'human', to = 'all', text, attachments = [] }) {
    this.room(roomId);
    if (from !== 'human' && from !== 'system' && this.get('agents', from).roomId !== roomId) throw new AppError('Sender belongs to another room.', 403);
    if (to !== 'all' && this.get('agents', to).roomId !== roomId) throw new AppError('Recipient belongs to another room.', 403);
    if (!Array.isArray(attachments) || attachments.length > 5 || attachments.some(id => typeof id !== 'string')) throw new AppError('Attach up to five files to a message.');
    if (new Set(attachments).size !== attachments.length) throw new AppError('Each attachment can be included only once.');
    const attachmentDetails = attachments.map(id => {
      const upload = this.data.uploads.find(u => u.id === id);
      if (!upload || upload.roomId !== roomId) throw new AppError('Attachment was not found in this room.', 403);
      const { path, ...safe } = upload; return safe;
    });
    const messageText = (text === undefined || text === null || (typeof text === 'string' && !text.trim())) && attachments.length ? 'Please review the attached files.' : text;
    const item = { id: randomUUID(), roomId, from, to, text: required(messageText, 'Message', 32000), ...(attachments.length ? { attachments, attachmentDetails } : {}), createdAt: new Date().toISOString() };
    this.data.messages.push(item); this.save(); return item;
  }
  addTask(input) {
    this.room(input.roomId);
    const item = { id: randomUUID(), roomId: input.roomId, title: required(input.title, 'Task title', 300), status: 'open', owner: null, createdAt: new Date().toISOString() };
    this.data.tasks.push(item); this.save(); return item;
  }
  updateTask(id, input, actor = null) {
    const task = this.get('tasks', id);
    if (actor && actor.roomId !== task.roomId) throw new AppError('Task belongs to another room.', 403);
    if (actor && task.owner && task.owner !== actor.id) throw new AppError('This task is already owned by another agent.', 409);
    if (input.owner !== undefined && input.owner !== null) {
      const owner = this.get('agents', input.owner);
      if (owner.roomId !== task.roomId) throw new AppError('Owner belongs to another room.', 403);
      if (actor && owner.id !== actor.id) throw new AppError('Agents can only claim tasks for themselves.', 403);
    }
    if (input.status !== undefined) task.status = choice(input.status, ['open', 'in_progress', 'done'], 'task status');
    if (input.owner !== undefined) task.owner = input.owner;
    this.save(); return task;
  }
  addFinding(input, actor = null) {
    this.room(input.roomId);
    if (actor && actor.roomId !== input.roomId) throw new AppError('Finding belongs to another room.', 403);
    const item = { id: randomUUID(), roomId: input.roomId, title: required(input.title, 'Finding title', 300), detail: required(input.detail, 'Finding evidence', 16000), severity: choice(input.severity ?? 'medium', ['high', 'medium', 'low'], 'severity'), status: 'open', author: actor?.id ?? 'human', revision: typeof input.revision === 'string' ? input.revision.slice(0, 200) : '', file: typeof input.file === 'string' ? input.file.slice(0, 500) : '', createdAt: new Date().toISOString() };
    this.data.findings.push(item); this.save(); return item;
  }
  updateFinding(id, input, actor = null) {
    const finding = this.get('findings', id);
    if (actor && actor.roomId !== finding.roomId) throw new AppError('Finding belongs to another room.', 403);
    finding.status = choice(input.status, ['open', 'resolved', 'disputed'], 'finding status'); this.save(); return finding;
  }
  context(agent) {
    const messages = this.data.messages.filter(m => m.roomId === agent.roomId && (m.to === 'all' || m.to === agent.id || m.from === agent.id)).slice(-40);
    const attachmentIds = new Set(messages.flatMap(m => m.attachments ?? []));
    return { room: this.room(agent.roomId), self: this.snapshot().agents.find(a => a.id === agent.id), agents: this.snapshot().agents.filter(a => a.roomId === agent.roomId), messages, uploads: this.data.uploads.filter(u => u.roomId === agent.roomId && attachmentIds.has(u.id)), tasks: this.data.tasks.filter(t => t.roomId === agent.roomId), findings: this.data.findings.filter(f => f.roomId === agent.roomId), assistance: this.data.assistance.filter(item => item.roomId === agent.roomId && item.status === 'open'), handoffs: this.data.handoffs.filter(item => item.roomId === agent.roomId).slice(-10) };
  }
}
