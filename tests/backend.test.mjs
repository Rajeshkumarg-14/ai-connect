import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once, EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { Store } from '../lib/store.mjs';
import { parseAgentEvent, cliArguments } from '../lib/agents.mjs';
import { handleRpc } from '../mcp.mjs';
import { createApp, waitForMessages } from '../server.mjs';
import { AgentManager } from '../lib/agents.mjs';
import { diagnose, sanitizeDiagnostic } from '../lib/diagnostics.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'connect-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, store: new Store(join(directory, 'state.json')) };
}
test('durable state preserves messages and redacts capability secrets', t => {
  const { directory, store } = fixture(t);
  const room = store.addRoom({ name: 'Project', path: directory });
  const agent = store.addAgent({ roomId: room.id, name: 'Reviewer', provider: 'codex' });
  store.addMessage({ roomId: room.id, text: 'Review this revision.' });
  assert.ok(agent.capabilityToken);
  assert.equal(store.snapshot().agents[0].capabilityToken, undefined);
  assert.equal(new Store(store.file).data.messages.length, 1);
});
test('task claims are atomic and cross-room messages and claims are rejected', t => {
  const { directory, store } = fixture(t);
  const a = store.addRoom({ name: 'A', path: directory }); const b = store.addRoom({ name: 'B', path: directory });
  const aa = store.addAgent({ roomId: a.id, name: 'A1', provider: 'claude' });
  const ab = store.addAgent({ roomId: a.id, name: 'A2', provider: 'codex' });
  const ba = store.addAgent({ roomId: b.id, name: 'B1', provider: 'codex' });
  const task = store.addTask({ roomId: a.id, title: 'Inspect auth' });
  store.updateTask(task.id, { owner: aa.id, status: 'in_progress' }, aa);
  assert.throws(() => store.updateTask(task.id, { owner: ab.id }, ab), /already owned/);
  assert.throws(() => store.updateTask(task.id, { status: 'done' }, ba), /another room/);
  assert.throws(() => store.addMessage({ roomId: a.id, from: aa.id, to: ba.id, text: 'Leak' }), /another room/);
  const privateMessage = store.addMessage({ roomId: a.id, from: 'human', to: aa.id, text: 'Private instruction' });
  assert.equal(store.context(ab).messages.some(m => m.id === privateMessage.id), false);
});
test('parses structured outputs and preserves restricted CLI arguments on resume', () => {
  assert.deepEqual(parseAgentEvent('codex', { type: 'thread.started', thread_id: 'thread-id' }), { sessionId: 'thread-id' });
  assert.deepEqual(parseAgentEvent('claude', { type: 'result', result: 'Denied', is_error: true }), { sessionId: undefined, result: 'Denied', error: 'Denied' });
  const agent = { provider: 'codex', role: 'reviewer', sessionId: 'saved-session', capabilityToken: 'scoped' };
  const args = cliArguments(agent, 'http://127.0.0.1:4318', 'hello');
  assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(args.includes('mcp_servers.connect.tools.send_message.approval_mode="approve"'));
  assert.ok(args.includes('mcp_servers.connect.required=true'));
  assert.ok(args.includes('resume')); assert.ok(args.includes('saved-session')); assert.equal(args.at(-1), '-');
  const claude = cliArguments({ ...agent, provider: 'claude' }, 'http://127.0.0.1:4318', 'hello');
  assert.ok(!claude.includes('--dangerously-skip-permissions'));
  assert.ok(!claude[claude.indexOf('--tools') + 1].split(',').includes('Edit'));
});
test('MCP initialization, notifications, calls and failures follow JSON-RPC', async () => {
  const rpc = (method, params) => ({ jsonrpc: '2.0', id: 1, method, params });
  const init = await handleRpc(rpc('initialize', { protocolVersion: '2025-11-25' }), {});
  assert.equal(init.result.protocolVersion, '2025-11-25');
  assert.equal(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, {}), null);
  const result = await handleRpc(rpc('tools/call', { name: 'send_message', arguments: { text: 'Hi', to: 'all' } }), { callTool: async () => ({ delivered: true }) });
  assert.equal(JSON.parse(result.result.content[0].text).delivered, true);
  const failed = await handleRpc(rpc('tools/call', { name: 'claim_task' }), { callTool: async () => { throw new Error('Already claimed'); } });
  assert.equal(failed.result.isError, true);
});
test('live relay wait receives addressed messages, excludes self and stops on abort', async t => {
  const { directory, store } = fixture(t);
  const room = store.addRoom({ name: 'Bridge', path: directory });
  const relay = store.addAgent({ roomId: room.id, name: 'Relay', provider: 'claude', role: 'bridge' });
  const marker = store.addMessage({ roomId: room.id, text: 'Earlier context' });
  const wait = waitForMessages(store, relay, { after: marker.id, timeoutMs: 1000 });
  const own = store.addMessage({ roomId: room.id, from: relay.id, text: 'Ignore my own message' });
  const dispatched = store.addMessage({ roomId: room.id, text: 'Review the latest diff' });
  dispatched.dispatch = { requested: true };
  const result = await wait; assert.equal(result.messages.length, 1); assert.equal(result.messages[0].text, 'Review the latest diff');
  const controller = new AbortController();
  const pending = waitForMessages(store, relay, { after: result.cursor, timeoutMs: 20000 }, { signal: controller.signal });
  controller.abort(); assert.equal((await pending).stopped, true);
  assert.ok(own.id);
});
test('HTTP broker authenticates, scopes agent tools, imports metadata, and restarts durably', async t => {
  const { directory } = fixture(t);
  const session = { id: 'claude:existing-session', sessionId: 'existing-session', provider: 'claude', cwd: directory, title: 'Existing terminal', status: 'running', importable: true };
  let contextReads = 0;
  const app = createApp({ requireLegalAcceptance: false, dataFile: join(directory, 'http-state.json'), discover: async () => ({ sessions: [session], processes: [], warnings: [] }), contextReader: async () => { contextReads++; return { excerpt: 'Context snapshot' }; }, managerOptions: { resolveCommand: () => null } });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening'); t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await fetch(`${base}/api/state`)).status, 401);
  assert.equal((await fetch(`${base}/api/bootstrap`, { headers: { origin: 'https://untrusted.example' } })).status, 403);
  const bootstrap = await (await fetch(`${base}/api/bootstrap`)).json();
  assert.ok(bootstrap.runtime.startedAt); assert.equal(bootstrap.runtime.historicalErrorsPreserved, true);
  const request = async (path, data, method = 'POST', headers = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', 'x-connect-token': bootstrap.token, ...headers }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const imported = await request('/api/import-session', { sessionId: session.id, partner: 'codex' });
  assert.equal(imported.status, 201); assert.equal(contextReads, 0);
  assert.equal(imported.data.source.status, 'external'); assert.equal(imported.data.partner.status, 'idle');
  assert.equal(imported.data.partner.capabilityToken, undefined);
  const room = imported.data.room;
  const task = await request('/api/tasks', { roomId: room.id, title: 'Review diff' });
  const agent = app.store.data.agents.find(a => a.id === imported.data.partner.id);
  const claimed = await request('/api/agent-tool', { name: 'claim_task', arguments: { taskId: task.data.id } }, 'POST', { authorization: `Bearer ${agent.capabilityToken}` });
  assert.equal(claimed.data.owner, agent.id);
  const invalid = await request('/api/agent-tool', { name: 'room_context' }, 'POST', { authorization: 'Bearer invalid' });
  assert.equal(invalid.status, 401);
  const old = new Store(join(directory, 'http-state.json')); assert.equal(old.data.rooms.length, 1);
});
test('managed fake CLI streams replies, resumes its session, and obeys room budget', async t => {
  const { directory } = fixture(t);
  const fake = join(directory, 'fake-cli.mjs');
  writeFileSync(fake, `let input=''; for await (const chunk of process.stdin) input+=chunk; console.log(JSON.stringify({type:'thread.started',thread_id:'saved-test-session'})); console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Review complete: no test findings.'}}));`);
  const app = createApp({ requireLegalAcceptance: false, dataFile: join(directory, 'managed-state.json'), managerOptions: { resolveCommand: () => ({ command: process.execPath, prefix: [fake] }) } });
  t.after(() => app.close());
  const room = app.store.addRoom({ name: 'Managed', path: directory }); room.maxTurns = 1;
  const agent = app.store.addAgent({ roomId: room.id, name: 'Codex', provider: 'codex' });
  app.manager.enqueue(agent.id, 'Review the project.');
  const until = Date.now() + 5000;
  while (app.manager.running.has(agent.id) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(agent.status, 'idle', agent.error); assert.equal(agent.sessionId, 'saved-test-session');
  assert.equal(app.store.data.messages.at(-1).text, 'Review complete: no test findings.');
  assert.equal(app.manager.enqueue(agent.id, 'Another turn.').errorInfo.code, 'TURN_BUDGET_EXHAUSTED');
  assert.equal(room.turns, 1);
});

test('diagnostics explain process permissions, provider quota and auth without leaking secrets', () => {
  const blocked = diagnose(Object.assign(new Error('spawn EPERM secret-token'), { code: 'EPERM' }), { provider: 'claude' });
  assert.equal(blocked.code, 'SERVER_PROCESS_BLOCKED'); assert.match(blocked.recovery, /normal PowerShell/);
  assert.doesNotMatch(JSON.stringify(blocked), /secret-token|--dangerously|EPERM/);
  const quota = diagnose("You've hit your 5-hour limit · resets 2:10pm (Asia/Kolkata)", { provider: 'claude' });
  assert.equal(quota.code, 'PROVIDER_QUOTA'); assert.match(quota.details, /2:10pm/);
  assert.equal(diagnose('Please sign in to continue', { provider: 'codex' }).code, 'AUTH_REQUIRED');
  assert.equal(diagnose('Turn exceeded its 5 minute time limit.').code, 'TURN_TIMEOUT');
  assert.equal(sanitizeDiagnostic('Authorization: Bearer secret-123'), 'Authorization: [redacted] [redacted]');
});

test('a synchronous process denial immediately marks the relay failed and shows recovery', t => {
  const { directory, store } = fixture(t);
  const room = store.addRoom({ name: 'Blocked relay', path: directory });
  const relay = store.addAgent({ roomId: room.id, name: 'Relay', provider: 'claude', role: 'bridge' });
  relay.targetSessionId = 'exact-selected-session'; relay.partnerAgentId = 'partner'; relay.bridgeStatus = 'connecting';
  const priorCapability = relay.capabilityToken;
  const manager = new AgentManager(store, { resolveCommand: () => ({ command: 'unused', prefix: [] }), spawnProcess: () => { throw Object.assign(new Error('spawn EPERM'), { code: 'EPERM' }); } });
  const result = manager.enqueue(relay.id, 'Connect the selected session.');
  assert.equal(result.status, 'failed'); assert.equal(relay.status, 'error'); assert.equal(relay.bridgeStatus, 'error');
  assert.equal(relay.errorInfo.code, 'SERVER_PROCESS_BLOCKED'); assert.notEqual(relay.capabilityToken, priorCapability);
  assert.ok(relay.failedAt); assert.equal(relay.errorInfo.failedAt, relay.failedAt);
  assert.match(store.data.messages.at(-1).text, /Restart Connect/); assert.doesNotMatch(store.data.messages.at(-1).text, /EPERM/);
  const restored = new Store(store.file); assert.equal(restored.data.agents[0].errorInfo.code, 'SERVER_PROCESS_BLOCKED'); assert.equal(restored.data.agents[0].bridgeStatus, 'error'); assert.equal(restored.data.agents[0].failedAt, relay.failedAt);
});

function mockChild() {
  const child = new EventEmitter();
  child.stdin = new Writable({ write(chunk, encoding, done) { done(); } }); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { child.stdout.end(); child.stderr.end(); child.emit('close', null, 'SIGTERM'); };
  return child;
}
test('queued and asynchronous failed turns update their original messages without relabeling older work', t => {
  const { directory, store } = fixture(t); const children = [];
  const manager = new AgentManager(store, { resolveCommand: () => ({ command: 'unused', prefix: [] }), spawnProcess: () => { const child = mockChild(); children.push(child); return child; } });
  t.after(() => manager.close());
  const room = store.addRoom({ name: 'Tracked delivery', path: directory });
  const agent = store.addAgent({ roomId: room.id, name: 'Reviewer', provider: 'codex' });
  const first = store.addMessage({ roomId: room.id, to: agent.id, text: 'First request' });
  manager.deliver(first, { run: true }); assert.equal(first.dispatch.running.length, 1);
  const second = store.addMessage({ roomId: room.id, to: agent.id, text: 'Second request' });
  manager.deliver(second, { run: true }); assert.equal(second.dispatch.queued.length, 1);
  manager.deliver(second, { run: true }); assert.equal(manager.queues.get(agent.id).length, 1, 'active duplicate replay must not queue twice');
  children[0].stdout.end(); children[0].stderr.end(); children[0].emit('close', 0, null);
  assert.equal(first.dispatch.completed.length, 1); assert.equal(first.dispatch.answered.length, 0); assert.equal(second.dispatch.running.length, 1);
  children[1].emit('error', Object.assign(new Error('spawn EPERM'), { code: 'EPERM' }));
  children[1].stdout.end(); children[1].stderr.end();
  assert.equal(second.dispatch.errors[0].errorInfo.code, 'SERVER_PROCESS_BLOCKED'); assert.equal(second.dispatch.running.length, 0);
  assert.equal(first.dispatch.completed.length, 1, 'later errors must not relabel an earlier successful message');
});

test('notes report no launch, explicit run retries the original message and reports missing CLI', async t => {
  const { directory } = fixture(t);
  const app = createApp({ requireLegalAcceptance: false, dataFile: join(directory, 'note-state.json'), managerOptions: { resolveCommand: () => null } });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening'); t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const { token } = await (await fetch(`${base}/api/bootstrap`)).json();
  const room = app.store.addRoom({ name: 'Notes', path: directory });
  const agent = app.store.addAgent({ roomId: room.id, name: 'Codex', provider: 'codex' });
  const post = async (path, data, authenticated = true) => {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated ? { 'x-connect-token': token } : {}) }, body: JSON.stringify(data) });
    return { status: response.status, value: await response.json() };
  };
  const note = await post('/api/messages', { roomId: room.id, to: agent.id, text: 'Please respond', run: false });
  assert.equal(note.value.dispatch.requested, false); assert.equal(note.value.dispatch.skipped[0].code, 'NOTE_ONLY'); assert.equal(room.turns, 0);
  assert.equal((await post(`/api/messages/${note.value.id}/run`, {}, false)).status, 401);
  const run = await post(`/api/messages/${note.value.id}/run`, {});
  assert.equal(run.value.messageId, note.value.id); assert.equal(run.value.dispatch.errors[0].errorInfo.code, 'CLI_NOT_FOUND');
  assert.equal(app.store.data.messages.filter(m => m.from === 'human').length, 1); assert.equal(agent.errorInfo.code, 'CLI_NOT_FOUND');
  const systemMessage = app.store.data.messages.find(m => m.from === 'system');
  assert.equal((await post(`/api/messages/${systemMessage.id}/run`, {})).status, 403);
});
