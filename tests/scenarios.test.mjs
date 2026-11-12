import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter, once } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { request as httpRequest } from 'node:http';
import { scenarioCatalog } from '../scripts/scenario-catalog.mjs';
import { Store } from '../lib/store.mjs';
import { AgentManager } from '../lib/agents.mjs';
import { diagnose } from '../lib/diagnostics.mjs';
import { NotificationCenter, notificationDefaults, isQuietTime } from '../lib/notifications.mjs';
import { Uploads, MAX_UPLOAD_BYTES } from '../lib/uploads.mjs';
import { handleRpc } from '../mcp.mjs';
import { createApp, waitForMessages } from '../server.mjs';
import { getSessionTranscript } from '../lib/discovery.mjs';

const directory = mkdtempSync(join(tmpdir(), 'connect-scenarios-'));
const seed = new Store(join(directory, 'seed.json')).data;
const catalog = scenarioCatalog();
const nativeHome = join(directory, 'native-home');
const transcriptEnd = {};
for (const provider of ['claude', 'codex']) {
  const nativeDirectory = provider === 'claude' ? join(nativeHome, '.claude', 'projects', 'fixture') : join(nativeHome, '.codex', 'sessions', '2026');
  mkdirSync(nativeDirectory, { recursive: true });
  const sessionId = 'valid-session';
  const rows = provider === 'claude' ? [] : [{ type: 'session_meta', payload: { id: sessionId, cwd: directory, timestamp: '2026-11-12T00:00:00Z' } }];
  for (let n = 0; n < 30; n++) {
    const role = n % 2 ? 'assistant' : 'user';
    rows.push(provider === 'claude' ? { sessionId, cwd: directory, type: role, message: { role, content: `Visible message ${n}` }, timestamp: '2026-11-12T00:00:00Z' } : { type: 'response_item', payload: { type: 'message', role, channel: role === 'assistant' ? 'final' : undefined, content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text: `Visible message ${n}` }] }, timestamp: '2026-11-12T00:00:00Z' });
  }
  const data = rows.map(row => JSON.stringify(row)).join('\n') + '\n';
  writeFileSync(join(nativeDirectory, `${sessionId}.jsonl`), data); transcriptEnd[provider] = Buffer.byteLength(data);
}
const app = createApp({ requireLegalAcceptance: false, dataFile: join(directory, 'http.json'), discover: async () => ({ sessions: [], processes: [], warnings: [] }), managerOptions: { resolveCommand: () => null }, notificationOptions: { intervalMs: 0, nativeIntervalMs: 0 } });
app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
const port = app.server.address().port;
const http = (path, { method = 'GET', headers = {}, data } = {}) => new Promise((resolve, reject) => {
  const req = httpRequest({ hostname: '127.0.0.1', port, path, method, headers }, res => {
    let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  });
  req.setTimeout(3000, () => req.destroy(new Error('HTTP fixture request timed out'))); req.on('error', reject); req.end(data);
});
const token = JSON.parse((await http('/api/bootstrap')).body).token;
after(() => { app.close(); rmSync(directory, { recursive: true, force: true }); });

function memoryStore() {
  const store = Object.create(Store.prototype); store.data = structuredClone(seed); store.file = join(directory, 'memory-only.json'); store.onChange = () => {}; store.saves = 0;
  store.save = function () { this.saves++; }; return store;
}
function agentsFixture({ role = 'reviewer', provider = 'codex' } = {}) {
  const store = memoryStore(); const room = store.addRoom({ name: 'Scenario room', path: directory }); const otherRoom = store.addRoom({ name: 'Other room', path: directory });
  const agent = store.addAgent({ roomId: room.id, name: 'Primary', provider, role }); const peer = store.addAgent({ roomId: room.id, name: 'Peer', provider: provider === 'codex' ? 'claude' : 'codex', role }); const outsider = store.addAgent({ roomId: otherRoom.id, name: 'Outsider', provider: 'codex', role });
  return { store, room, otherRoom, agent, peer, outsider };
}
function fakeManager(store, { timeout = 60000, disconnect = false } = {}) {
  const launches = [];
  const manager = new AgentManager(store, { turnTimeout: timeout, resolveCommand: () => ({ command: 'fixture', prefix: [] }), spawnProcess: (command, args) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.stdin = new Writable({ write(chunk, encoding, done) { done(disconnect ? Object.assign(new Error('Broken pipe'), { code: 'EPIPE' }) : null); } });
    child.kill = () => { child.stdout.end(); child.stderr.end(); child.emit('close', null, 'SIGTERM'); };
    launches.push({ child, args }); return child;
  } }); return { manager, launches };
}
function finish(child, code = 0) { child.stdout.end(); child.stderr.end(); child.emit('close', code, null); }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runScenario({ category, params: p, id }) {
  if (category === 'notification-channels') {
    const store = memoryStore(); const keys = ['enabled', 'inApp', 'browser', 'sound', 'notifyOnReply', 'notifyOnError', 'quietHoursEnabled']; const prefs = notificationDefaults(); keys.forEach((key, bit) => { prefs[key] = Boolean(p.mask & (1 << bit)); });
    store.data.settings.notifications = prefs; const events = [];
    const center = new NotificationCenter(store, { intervalMs: 0, now: () => new Date('2026-11-12T17:00:00Z'), emit: (name, item) => events.push(item) });
    const result = center.notify({ kind: p.kind, title: 'Scenario notification', message: 'A real event payload' });
    const expected = prefs.enabled && !prefs.quietHoursEnabled && (p.kind !== 'reply' || prefs.notifyOnReply) && (p.kind !== 'error' || prefs.notifyOnError);
    assert.equal(Boolean(result), expected); assert.equal(events.length, expected ? 1 : 0); assert.equal(store.data.notifications.length, expected && prefs.inApp ? 1 : 0);
    if (result) assert.deepEqual(result.channels, { inApp: prefs.inApp, browser: prefs.browser, sound: prefs.sound }); center.close(); return;
  }
  if (category === 'quiet-hours') {
    const settings = { ...notificationDefaults(), timezone: p.timezone, quietHoursEnabled: p.window !== 'disabled', quietStart: p.window === 'daytime' ? '09:00' : p.window === 'all-day' ? '12:00' : '22:00', quietEnd: p.window === 'daytime' ? '17:00' : p.window === 'all-day' ? '12:00' : '08:00' };
    // Fixed known UTC offsets for this November date, independent of the code's formatter.
    const offsetMinutes = { UTC: 0, 'Asia/Kolkata': 330, 'America/New_York': -300 }[p.timezone];
    const utc = new Date(Date.UTC(2026, 10, 12, p.hour, 0) - offsetMinutes * 60000);
    const expected = p.window === 'disabled' ? false : p.window === 'all-day' ? true : p.window === 'daytime' ? p.hour >= 9 && p.hour < 17 : p.hour >= 22 || p.hour < 8;
    assert.equal(isQuietTime(settings, utc), expected); return;
  }
  if (category === 'notification-overrides') {
    const { store, room, agent } = agentsFixture(); const prefs = store.data.settings.notifications; prefs.enabled = p.enabled; room.archived = p.archived; const sessionId = 'claude:scenario-native';
    if (p.override !== 'unset') prefs.perSession[agent.id] = p.override === 'enabled'; if (p.hidden) store.data.hiddenSessions[sessionId] = true;
    const center = new NotificationCenter(store, { intervalMs: 0 });
    assert.equal(center.allowed({ kind: p.kind, roomId: room.id, agentId: agent.id, sessionId }), p.enabled && !p.archived && !p.hidden && p.override !== 'muted'); center.close(); return;
  }
  if (category === 'quota-handoff') {
    const { store, room, agent: source, peer: target } = agentsFixture({ provider: p.sourceProvider, role: p.sourceRole });
    target.role = p.targetRole; target.status = p.targetStatus; room.failoverEnabled = p.enabled; room.turns = 1; room.maxTurns = p.budget === 'available' ? 3 : 1;
    if (p.approved) store.approvePlan(room.id, { text: 'Repair the parser; keep the public API unchanged.', approve: true });
    source.status = 'error'; source.errorInfo = diagnose('Usage limit reached', { provider: p.sourceProvider });
    const message = store.addMessage({ roomId: room.id, to: source.id, text: 'Continue the approved parser repair.' });
    const task = store.addTask({ roomId: room.id, title: 'Finish parser repair' }); store.updateTask(task.id, { owner: source.id, status: 'in_progress' });
    const { manager, launches } = fakeManager(store); manager.tryFailover(source, { messageId: message.id, stopped: false });
    const expected = p.enabled && p.approved && p.budget === 'available' && p.targetRole === p.sourceRole && p.targetStatus === 'idle';
    assert.equal(launches.length, expected ? 1 : 0); assert.equal(task.owner, expected ? target.id : source.id); assert.equal(room.turns, expected ? 2 : 1);
    assert.equal(store.data.assistance.length, p.enabled && !expected ? 1 : 0); assert.equal(target.role, p.targetRole);
    if (expected) { assert.equal(message.failoverCount, 1); assert.equal(store.data.handoffs[0].status, 'started'); finish(launches[0].child); }
    manager.close(); return;
  }
  if (category === 'input-boundaries') {
    const { store, room } = agentsFixture();
    const limits = { 'room-name': 100, 'agent-name': 80, message: 32000, 'task-title': 300, 'finding-title': 300, 'finding-detail': 16000 }; const limit = limits[p.field];
    const values = { minimum: 'x', maximum: 'x'.repeat(limit), 'over-limit': 'x'.repeat(limit + 1), whitespace: ' \t\n ', empty: '', number: 12, null: null, object: { text: 'x' } }; const value = values[p.value];
    const action = () => p.field === 'room-name' ? store.addRoom({ name: value, path: directory }) : p.field === 'agent-name' ? store.addAgent({ roomId: room.id, name: value, provider: 'codex' }) : p.field === 'message' ? store.addMessage({ roomId: room.id, text: value }) : p.field === 'task-title' ? store.addTask({ roomId: room.id, title: value }) : store.addFinding({ roomId: room.id, title: p.field === 'finding-title' ? value : 'Finding', detail: p.field === 'finding-detail' ? value : 'Concrete evidence' });
    if (['minimum', 'maximum'].includes(p.value)) assert.ok(action().id); else assert.throws(action, /must be between/); return;
  }
  if (category === 'room-update') {
    const { store, room, peer } = agentsFixture(); const before = structuredClone(room);
    const values = { true: true, false: false, zero: 0, one: 1, fifty: 50, 'fifty-one': 51, fraction: 1.5, text: peer.id, null: null, object: {} }; const value = values[p.value];
    const valid = ['autoReply', 'failoverEnabled'].includes(p.field) ? typeof value === 'boolean' : p.field === 'maxTurns' ? Number.isInteger(value) && value >= 1 && value <= 50 : value === null || value === peer.id;
    const action = () => store.updateRoom(room.id, { autoReply: !room.autoReply, [p.field]: value });
    if (valid) assert.equal(action()[p.field], value); else { assert.throws(action); assert.deepEqual(room, before, 'invalid room patches must not partially toggle automation'); } return;
  }
  if (category === 'task-ownership') {
    const { store, room, agent, peer, outsider } = agentsFixture(p); const task = store.addTask({ roomId: room.id, title: 'Scenario task' }); const actor = p.sameRoom ? agent : outsider;
    if (p.ownership !== 'unowned') task.owner = p.ownership === 'self' ? agent.id : peer.id;
    const before = structuredClone(task); const valid = p.sameRoom && p.ownership !== 'other'; const action = () => store.updateTask(task.id, { owner: actor.id, status: p.status }, actor);
    if (valid) { const result = action(); assert.equal(result.owner, agent.id); assert.equal(result.status, p.status); } else { assert.throws(action); assert.deepEqual(task, before); } return;
  }
  if (category === 'finding-transitions') {
    const { store, room, agent, outsider } = agentsFixture(); const finding = store.addFinding({ roomId: room.id, title: 'Concrete bug', detail: 'Reproduction evidence', severity: p.severity });
    const action = () => store.updateFinding(finding.id, { status: p.status }, p.sameRoom ? agent : outsider);
    if (p.sameRoom) { assert.equal(action().status, p.status); assert.equal(finding.severity, p.severity); } else { assert.throws(action, /another room/); assert.equal(finding.status, 'open'); } return;
  }
  if (category === 'mcp-invalid-envelope') {
    const requests = { null: null, array: [], string: 'bad', number: 12, boolean: true, empty: {}, 'bad-version': { jsonrpc: '1.0', id: 1, method: 'ping' }, 'missing-version': { id: 1, method: 'ping' }, 'bad-method': { jsonrpc: '2.0', id: 1, method: 1 }, 'missing-method': { jsonrpc: '2.0', id: 1 }, 'object-id': { jsonrpc: '2.0', id: {}, method: 'ping' }, 'array-id': { jsonrpc: '2.0', id: [], method: 'ping' }, 'boolean-id': { jsonrpc: '2.0', id: true, method: 'ping' }, 'infinite-id': { jsonrpc: '2.0', id: Infinity, method: 'ping' } };
    const badParams = { 'null-params': null, 'array-params': [], 'string-params': 'bad', 'number-params': 12, 'boolean-params': false };
    const request = Object.hasOwn(badParams, p.shape) ? { jsonrpc: '2.0', id: 1, method: 'initialize', params: badParams[p.shape] } : requests[p.shape];
    const response = await handleRpc(request); assert.equal(response.error.code, Object.hasOwn(badParams, p.shape) ? -32602 : -32600); return;
  }
  if (category === 'mcp-request-id') {
    const ids = { zero: 0, positive: 7, negative: -2, string: 'request-id', 'empty-string': '', null: null }; const response = await handleRpc({ jsonrpc: '2.0', id: ids[p.id], method: p.method }); assert.equal(response.id, ids[p.id]);
    if (p.method === 'unknown') assert.equal(response.error.code, -32601); else if (p.method === 'tools/call') assert.equal(response.error.code, -32602); else assert.ok(response.result); return;
  }
  if (category === 'mcp-tool-outcomes') {
    let calls = 0; const response = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: p.tool, arguments: p.outcome === 'invalid-arguments' ? 'not-an-object' : {} } }, { callTool: async name => { calls++; assert.equal(name, p.tool); if (p.outcome === 'error-object') throw new Error('Fixture failure'); if (p.outcome === 'error-string') throw 'Fixture string failure'; return { ok: true, tool: name }; } });
    if (p.outcome === 'invalid-arguments') { assert.equal(response.error.code, -32602); assert.equal(calls, 0); } else if (p.outcome.startsWith('error')) { assert.equal(response.result.isError, true); assert.equal(typeof response.result.content[0].text, 'string'); } else assert.equal(JSON.parse(response.result.content[0].text).tool, p.tool); return;
  }
  if (category === 'mcp-version') {
    const response = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: p.version === 'missing' ? {} : { protocolVersion: p.version } }); assert.equal(response.result.protocolVersion, ['future-unknown', 'missing'].includes(p.version) ? '2024-11-05' : p.version); return;
  }
  if (category.startsWith('upload-')) {
    const { store, room, otherRoom } = agentsFixture(); store.file = join(directory, id, 'state.json'); const uploads = new Uploads(store);
    if (category === 'upload-source') {
      const names = { plain: `file.${p.extension}`, traversal: `../../file.${p.extension}`, 'windows-path': `C:\\outside\\file.${p.extension}` }; const result = uploads.save({ roomId: room.id, name: names[p.prefix], data: Buffer.from('source text, never executed').toString('base64') });
      assert.equal(result.name, `file.${p.extension}`); assert.equal(result.path, undefined); assert.equal(uploads.get(result.id).bytes.toString(), 'source text, never executed'); assert.equal(store.snapshot().uploads[0].path, undefined); return;
    }
    if (category === 'upload-invalid') {
      const input = { roomId: room.id, name: 'file.txt', data: Buffer.from('text').toString('base64') };
      if (p.shape === 'empty-data') input.data = ''; if (p.shape === 'empty-name') input.name = ''; if (p.shape === 'bad-base64') input.data = '!!!!'; if (p.shape === 'bad-padding') input.data = 'YWJj='; if (p.shape === 'data-url') input.data = 'data:text/plain;base64,YWJj'; if (p.shape === 'binary-text') input.data = Buffer.from([0, 1, 2]).toString('base64');
      if (['exe', 'zip', 'svg'].includes(p.shape)) input.name = `file.${p.shape}`; if (p.shape.startsWith('fake-')) input.name = `file.${p.shape.slice(5)}`; if (p.shape === 'missing-room') input.roomId = 'missing'; if (p.shape === 'archived-room') room.archived = true; if (p.shape === 'oversize') input.data = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 65).toString('base64');
      assert.throws(() => uploads.save(input)); assert.equal(store.data.uploads.length, 0); return;
    }
    const bytes = p.type === 'png' ? Buffer.from([137,80,78,71,13,10,26,10,0]) : p.type === 'jpg' ? Buffer.from([255,216,255,0]) : p.type === 'webp' ? Buffer.from('RIFFxxxxWEBP') : Buffer.from('%PDF-fixture');
    const ids = []; for (let n = 0; n < p.count; n++) ids.push(uploads.save({ roomId: room.id, name: `file-${n}.${p.type}`, data: bytes.toString('base64') }).id);
    const message = store.addMessage({ roomId: room.id, to: 'all', attachments: ids }); assert.equal(message.attachments.length, p.count); assert.equal(message.text, 'Please review the attached files.'); assert.throws(() => store.addMessage({ roomId: otherRoom.id, attachments: ids }), /this room/); return;
  }
  if (category === 'http-auth') {
    const headers = p.auth === 'wrong-token' ? { 'x-connect-token': 'wrong' } : p.auth === 'cross-origin' ? { 'x-connect-token': token, origin: 'https://remote.example' } : p.auth === 'wrong-host' ? { 'x-connect-token': token, host: 'remote.example' } : {};
    const response = await http(p.route, { headers }); assert.equal(response.status, ['wrong-host', 'cross-origin'].includes(p.auth) ? 403 : 401); return;
  }
  if (category === 'http-body') {
    const payloads = { null: 'null', array: '[]', empty: '', malformed: '{', number: '12', string: '"text"', boolean: 'true', oversized: JSON.stringify({ name: 'x'.repeat(132000), path: directory }) };
    const headers = { 'x-connect-token': token, ...(p.contentType === 'json' ? { 'content-type': 'application/json' } : p.contentType === 'plain' ? { 'content-type': 'text/plain' } : {}) };
    const response = await http('/api/rooms', { method: 'POST', headers, data: payloads[p.payload] }); assert.equal(response.status, p.contentType !== 'json' ? 415 : p.payload === 'oversized' ? 413 : 400); return;
  }
  if (category === 'transcript-identifiers') {
    const action = () => getSessionTranscript(p.identifier, { home: nativeHome, provider: p.provider, limit: 2 }); const valid = ['claude:valid-session', 'codex:valid-session'].includes(p.identifier) && p.identifier.startsWith(`${p.provider}:`);
    if (valid) assert.equal((await action()).messages.length, 2); else await assert.rejects(action, /identifier|provider|not found/); return;
  }
  if (category === 'transcript-cursors') {
    const values = { negative: -1, fraction: 1.5, text: 'next', object: {}, 'too-long': '12345678901234567', 'beyond-end': transcriptEnd.claude + 1, zero: '0', 'exact-end': String(transcriptEnd.claude), one: '1', 'leading-zero': '0000', null: null, missing: undefined };
    const action = () => getSessionTranscript('claude:valid-session', { home: nativeHome, before: values[p.before], limit: 5 });
    if (['negative', 'fraction', 'text', 'object', 'too-long', 'beyond-end'].includes(p.before)) await assert.rejects(action, /cursor|changed/); else { const result = await action(); assert.ok(result.messages.length <= 5); if (['zero', 'leading-zero'].includes(p.before)) assert.equal(result.messages.length, 0); } return;
  }
  if (category === 'transcript-pages') {
    const first = await getSessionTranscript(`${p.provider}:valid-session`, { home: nativeHome, limit: p.limit }); const expected = Math.min(p.limit, 30);
    assert.equal(first.messages.length, expected); assert.equal(first.messages.at(-1).text, 'Visible message 29');
    if (p.position === 'earlier' && first.hasMore) { const earlier = await getSessionTranscript(`${p.provider}:valid-session`, { home: nativeHome, before: first.nextCursor, limit: p.limit }); const latestIds = new Set(first.messages.map(m => m.id)); assert.ok(earlier.messages.every(m => !latestIds.has(m.id))); assert.equal(earlier.messages.length, Math.min(p.limit, 30 - expected)); } else assert.equal(first.hasMore, p.limit < 30); return;
  }
  if (category === 'persistence-corruption') {
    const fixtures = { empty: '', malformed: '{', null: 'null', array: '[]', 'wrong-version': JSON.stringify({ ...seed, version: 99 }), 'missing-collections': '{"version":1}', 'bad-rooms': JSON.stringify({ ...seed, rooms: {} }), 'bad-agents': JSON.stringify({ ...seed, agents: 'bad' }) };
    const file = join(directory, `${id}.json`); writeFileSync(file, fixtures[p.corruption]); assert.throws(() => new Store(file)); assert.equal(readFileSync(file, 'utf8'), fixtures[p.corruption], 'corrupt history must not be replaced'); return;
  }
  if (category === 'persistence-restart') {
    const { store, agent } = agentsFixture({ role: p.role }); agent.status = p.status; if (p.status === 'error') { agent.error = 'spawn EPERM'; agent.failedAt = '2026-11-11T01:00:00.000Z'; }
    if (p.role === 'bridge') agent.bridgeStatus = 'connecting'; const file = join(directory, `${id}.json`); writeFileSync(file, JSON.stringify(store.data)); const reloaded = new Store(file); const restored = reloaded.data.agents[0];
    assert.equal(restored.status, ['running', 'queued'].includes(p.status) ? 'stopped' : p.status); if (p.status === 'error') { assert.equal(restored.errorInfo.code, 'SERVER_PROCESS_BLOCKED'); assert.equal(restored.failedAt, agent.failedAt); } if (p.role === 'bridge') assert.notEqual(restored.bridgeStatus, 'connecting'); return;
  }
  if (category === 'queue-saturation') {
    const { store, room, agent } = agentsFixture(p); const { manager, launches } = fakeManager(store); manager.enqueue(agent.id, 'First active request');
    const outcomes = []; for (let n = 0; n < p.queued; n++) outcomes.push(manager.enqueue(agent.id, `Queued request ${n}`));
    assert.equal(manager.queues.get(agent.id)?.length ?? 0, Math.min(p.queued, 8)); assert.equal(launches.length, 1); if (p.queued === 9) assert.equal(outcomes.at(-1).errorInfo.code, 'QUEUE_FULL'); manager.stopRoom(room.id); assert.equal(manager.queues.has(agent.id), false); assert.equal(manager.running.size, 0); return;
  }
  if (category === 'worker-lifecycle') {
    const { store, room, agent } = agentsFixture(p); const { manager, launches } = fakeManager(store, { timeout: p.action === 'timeout' ? 10 : 60000, disconnect: p.action === 'disconnect' });
    manager.enqueue(agent.id, 'Bounded fixture request'); const capability = agent.capabilityToken;
    if (p.action === 'timeout') { await delay(25); assert.equal(agent.errorInfo.code, 'TURN_TIMEOUT'); assert.equal(manager.running.size, 0); }
    if (p.action === 'stop') { manager.stop(agent.id); assert.equal(agent.status, 'stopped'); assert.notEqual(agent.capabilityToken, capability); }
    if (p.action === 'close') { manager.close(); assert.equal(manager.running.size, 0); assert.equal(manager.enqueue(agent.id, 'After shutdown').code, 'SERVER_STOPPING'); }
    if (p.action === 'output-limit') { launches[0].child.stdout.write('x'.repeat(4 * 1024 * 1024 + 1) + '\n'); assert.equal(agent.errorInfo.code, 'OUTPUT_LIMIT'); assert.equal(manager.running.size, 0); }
    if (p.action === 'disconnect') { await delay(0); launches[0].child.emit('error', new Error('Broken pipe')); finish(launches[0].child, 1); assert.equal(agent.status, 'error'); assert.equal(manager.running.size, 0); }
    manager.close(); return;
  }
  if (category === 'message-wait') {
    const { store, room, agent } = agentsFixture(); const marker = store.addMessage({ roomId: room.id, text: 'Baseline' }); const controller = new AbortController(); let stopped = false;
    if (p.action === 'abort-before') controller.abort();
    const pending = waitForMessages(store, agent, { after: marker.id, timeoutMs: p.action === 'zero-timeout' ? 0 : p.action === 'bounded-timeout' ? 10 : 1000 }, { signal: controller.signal, isStopped: () => stopped });
    if (p.action === 'abort-after') controller.abort(); if (p.action === 'room-stop') stopped = true; if (p.action === 'new-message') { const message = store.addMessage({ roomId: room.id, text: 'New request' }); message.dispatch = { requested: true }; }
    const result = await pending; assert.equal(result.stopped, ['abort-before', 'abort-after', 'room-stop'].includes(p.action)); assert.equal(result.messages.length, p.action === 'new-message' ? 1 : 0); return;
  }
  throw new Error(`Scenario category is not implemented: ${category}`);
}

for (const scenario of catalog) test(`${scenario.id} ${JSON.stringify(scenario.params)}`, { timeout: 5000 }, () => runScenario(scenario));
