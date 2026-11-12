import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { once, EventEmitter } from 'node:events';
import { Readable, Writable, PassThrough } from 'node:stream';
import { createServer as netServer } from 'node:net';
import { Store } from '../lib/store.mjs';
import { AgentManager, resolveCli, parseAgentEvent, cliArguments } from '../lib/agents.mjs';
import { createApp, startServer } from '../server.mjs';
import { main as mcpMain } from '../mcp.mjs';
import { discoverSessions, getSessionContext, getSessionTranscript } from '../lib/discovery.mjs';
import { NotificationCenter, NativeSessionNotifications, patchNotificationSettings } from '../lib/notifications.mjs';
import { Uploads } from '../lib/uploads.mjs';
import { diagnose } from '../lib/diagnostics.mjs';

function temp(t) { const directory = mkdtempSync(join(tmpdir(), 'connect-runtime-')); t.after(() => rmSync(directory, { recursive: true, force: true })); return directory; }
async function appFixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'connect-http-'));
  const app = createApp({ requireLegalAcceptance: false, dataFile: join(directory, 'state.json'), notificationOptions: { intervalMs: 0, nativeIntervalMs: 0 }, managerOptions: { resolveCommand: () => null }, discover: async () => ({ sessions: [], processes: [], warnings: [] }), ...overrides });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  t.after(() => { app.close(); rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const bootstrap = await (await fetch(`${base}/api/bootstrap`)).json();
  const request = async (path, data, method = 'POST', headers = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { 'x-connect-token': bootstrap.token, 'content-type': 'application/json', ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    const text = await response.text(); let value; try { value = JSON.parse(text); } catch { value = text; }
    return { response, status: response.status, value };
  };
  return { app, directory, base, bootstrap, request };
}
function fakeChild() {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new Writable({ write(chunk, encoding, done) { done(); } });
  child.kill = () => { child.stdout.end(); child.stderr.end(); child.emit('close', null, 'SIGTERM'); }; return child;
}
async function freePort() { const server = netServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }

test('MCP stdio processes fragmented input, parse errors, notifications, and broker tool failures', async () => {
  let text = ''; const output = new Writable({ write(chunk, encoding, done) { text += chunk; done(); } }); const calls = [];
  const requests = ['\n', '{bad}\n', JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }) + '\n', ...[2, 3, 4].map(id => JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'room_context' } }) + '\n')].join('');
  const input = Readable.from([requests.slice(0, 17), requests.slice(17)]);
  await mcpMain({ input, output, env: { CONNECT_URL: 'http://127.0.0.1:4318', CONNECT_AGENT_TOKEN: 'fixture-secret' }, fetchImpl: async (url, init) => {
    calls.push({ url, init }); const n = calls.length; return { ok: n === 1, json: async () => n === 1 ? { room: 'Fixture' } : n === 2 ? { error: 'Explicit fixture failure' } : {} };
  } });
  const replies = text.trim().split('\n').map(line => JSON.parse(line)); assert.equal(replies[0].error.code, -32700); assert.equal(replies.length, 5); assert.equal(replies[2].result.content[0].text, '{"room":"Fixture"}');
  assert.match(replies[3].result.content[0].text, /Explicit fixture failure/); assert.match(replies[4].result.content[0].text, /Broker rejected/); assert.equal(calls[0].init.headers.authorization, 'Bearer fixture-secret'); assert.equal(calls[0].url.hostname, '127.0.0.1');
  await assert.rejects(() => mcpMain({ input: Readable.from([]), output, env: {} }), /TOKEN/);
});
for (const url of ['https://127.0.0.1:4318', 'http://remote.example', 'https://remote.example', 'http://localhost.evil', 'http://127.0.0.1.evil', 'http://192.168.1.1', 'http://0.0.0.0', 'http://[::2]', 'ws://localhost', 'file:///tmp/broker', 'not a URL']) test(`MCP refuses nonlocal or unsupported broker URL ${url}`, async () => {
  let called = false;
  await assert.rejects(() => mcpMain({ input: Readable.from([]), output: new PassThrough(), env: { CONNECT_URL: url, CONNECT_AGENT_TOKEN: 'fixture' }, fetchImpl: async () => { called = true; } }), /local HTTP|Invalid URL/);
  assert.equal(called, false);
});
for (const url of ['http://127.0.0.1:4318', 'http://localhost:4318', 'http://[::1]:4318']) test(`MCP accepts loopback broker URL ${url} without contacting a provider`, async () => {
  await mcpMain({ input: Readable.from(['{"jsonrpc":"2.0","id":1,"method":"ping"}\n']), output: new PassThrough(), env: { CONNECT_URL: url, CONNECT_AGENT_TOKEN: 'fixture' }, fetchImpl: async () => { throw new Error('No network should be needed for ping'); } });
});

test('API exercises scoped MCP waits, bridge state reporting and all agent-owned task/findings operations', async t => {
  const { app, directory, request } = await appFixture(t); const room = app.store.addRoom({ name: 'Tools', path: directory });
  const agent = app.store.addAgent({ roomId: room.id, name: 'Claude', provider: 'claude' }); const peer = app.store.addAgent({ roomId: room.id, name: 'Codex', provider: 'codex' });
  const task = app.store.addTask({ roomId: room.id, title: 'Review inputs' });
  const tool = (name, args = {}, actor = agent) => request('/api/agent-tool', { name, arguments: args }, 'POST', { authorization: `Bearer ${actor.capabilityToken}` });
  assert.equal((await tool('list_tasks')).value.length, 1); assert.equal((await tool('update_task', { taskId: task.id, status: 'done' })).value.status, 'done');
  assert.equal((await tool('report_finding', { title: 'Bad input', detail: 'A concrete reproducer', severity: 'low' })).value.author, agent.id);
  assert.equal((await tool('send_message', { to: peer.id, text: 'Review this detail' })).status, 200);
  assert.equal((await tool('wait_for_messages', { timeoutMs: 0 })).value.stopped, false);
  assert.equal((await tool('unknown')).status, 400); assert.equal((await request('/api/agent-tool', { name: 'room_context', arguments: 'bad' }, 'POST', { authorization: `Bearer ${agent.capabilityToken}` })).status, 400);
  assert.equal((await tool('bridge_status', { status: 'connected', evidence: 'not a bridge' })).status, 403);
  const bridge = app.store.addAgent({ roomId: room.id, name: 'Relay', provider: 'claude', role: 'bridge' });
  for (const status of ['connected', 'error', 'stopped']) assert.equal((await tool('bridge_status', { status, evidence: 'Fixture native outcome' }, bridge)).value.status, status);
  assert.equal((await tool('bridge_status', { status: 'invalid', evidence: 'bad' }, bridge)).status, 400);
  assert.equal((await tool('wait_for_messages', { timeoutMs: 100 }, bridge)).value.stopped, true);
  assert.equal((await tool('request_assistance', { question: 'Should scope change?' })).value.status, 'waiting_for_human');
});

test('API notifications, session preferences and validation report all normal/error outcomes', async t => {
  const { app, request } = await appFixture(t, { transcriptReader: async () => { throw new Error('Fixture transcript temporarily unavailable'); } });
  assert.equal((await request('/api/settings', undefined, 'GET')).value.notifications.enabled, true);
  const enabled = await request('/api/session-notifications', { sessionId: 'claude:fixture-session', enabled: true }, 'PATCH'); assert.match(enabled.value.warning, /could not be read/);
  assert.equal((await request('/api/session-notifications', { sessionId: '/', enabled: 'bad' }, 'PATCH')).status, 400);
  app.store.data.settings.notifications.perSession = Object.fromEntries(Array.from({ length: 500 }, (_, n) => [`setting-${n}`, false]));
  assert.equal((await request('/api/session-notifications', { sessionId: 'new-session', enabled: true }, 'PATCH')).status, 400);
  app.store.data.settings.notifications.perSession = Object.fromEntries(Array.from({ length: 20 }, (_, n) => [`claude:native-${n}`, true]));
  assert.equal((await request('/api/session-notifications', { sessionId: 'claude:new-native-session', enabled: true }, 'PATCH')).status, 400);
  const result = await request('/api/notifications/test', {}); const id = result.value.notification.id; assert.ok(id);
  assert.equal((await request(`/api/notifications/${id}/read`, {})).value.read, true); assert.equal((await request(`/api/notifications/${id}/read`, { read: false })).value.read, false);
  assert.equal((await request(`/api/notifications/${id}/read`, { read: 'bad' })).status, 400); assert.equal((await request('/api/notifications/missing/read', {})).status, 404);
  assert.equal((await request('/api/notifications/custom/missing', undefined, 'DELETE')).status, 404);
});

test('API session imports cover context opt-in, unavailable context, optional relay and unsupported pairing', async t => {
  let contextFails = false;
  const sessions = [];
  const { app, directory, request } = await appFixture(t, { discover: async () => ({ sessions, processes: [], warnings: [] }), contextReader: async () => { if (contextFails) throw new Error('Fixture snapshot not available'); return { excerpt: 'A saved conversation snapshot' }; } });
  sessions.push({ id: 'claude:fixture-session', sessionId: 'fixture-session', provider: 'claude', cwd: directory, title: 'Existing Claude', status: 'running', importable: true });
  assert.equal((await request('/api/import-session', { sessionId: 'missing' })).status, 400);
  assert.equal((await request('/api/import-session', { sessionId: sessions[0].id, partner: 'unsupported' })).status, 400);
  const imported = await request('/api/import-session', { sessionId: sessions[0].id, partner: 'codex', includeContext: true, liveBridge: true });
  assert.equal(imported.value.bridge.role, 'bridge'); assert.equal(imported.value.bridge.errorInfo.code, 'CLI_NOT_FOUND'); assert.ok(app.store.data.messages.some(m => /saved conversation snapshot/.test(m.text)));
  contextFails = true;
  const failedContext = await request('/api/import-session', { sessionId: sessions[0].id, partner: 'claude', includeContext: true, liveBridge: true }); assert.equal(failedContext.status, 201); assert.equal(failedContext.value.bridge, undefined);
  assert.ok(app.store.data.messages.some(m => /snapshot not available/.test(m.text))); assert.ok(app.store.data.messages.some(m => /Live bridge is available only/.test(m.text)));
});

test('API creates and updates all room resources, returns explicit dispatch, and refuses invalid assistance', async t => {
  const { app, directory, request } = await appFixture(t);
  const room = (await request('/api/rooms', { name: 'API room', path: directory })).value; const peerRoom = app.store.addRoom({ name: 'Outside', path: directory });
  const agent = (await request('/api/agents', { roomId: room.id, name: 'Codex', provider: 'codex' })).value;
  const outsider = app.store.addAgent({ roomId: peerRoom.id, name: 'Outside', provider: 'claude' });
  assert.equal(agent.capabilityToken, undefined); assert.equal((await request(`/api/rooms/${room.id}`, { autoReply: true, maxTurns: 4 }, 'PATCH')).value.maxTurns, 4);
  const task = (await request('/api/tasks', { roomId: room.id, title: 'Work' })).value; assert.equal((await request(`/api/tasks/${task.id}`, { status: 'done', owner: agent.id }, 'PATCH')).value.status, 'done');
  const finding = (await request('/api/findings', { roomId: room.id, title: 'Bug', detail: 'Evidence' })).value; assert.equal((await request(`/api/findings/${finding.id}`, { status: 'disputed' }, 'PATCH')).value.status, 'disputed');
  const config = await request(`/api/agents/${agent.id}/config`, undefined, 'GET'); assert.ok(config.value.mcpServers.connect.env.CONNECT_AGENT_TOKEN);
  assert.equal((await request(`/api/agents/${agent.id}/run`, { prompt: 'Review' })).value.dispatch.errorInfo.code, 'CLI_NOT_FOUND');
  assert.equal((await request(`/api/agents/${agent.id}/stop`, {})).status, 200); assert.equal((await request(`/api/rooms/${room.id}/stop`, {})).status, 200);
  const item = app.store.addAssistance({ roomId: room.id, agentId: agent.id, question: 'Need a decision' });
  assert.equal((await request(`/api/assistance/${item.id}/respond`, { text: 'Answer', to: outsider.id })).status, 400);
  assert.equal((await request(`/api/assistance/${item.id}/respond`, { text: 'Answer', run: false })).status, 200);
  assert.equal((await request(`/api/assistance/${item.id}/respond`, { text: 'Again' })).status, 409);
  assert.equal((await request(`/api/rooms/${room.id}/archive`, { archived: 'bad' })).status, 400);
  assert.equal((await request('/api/unrecognized', undefined, 'GET')).status, 404);
});

test('static and legal routes serve locally with no-cache, HEAD, missing-file and method restrictions', async t => {
  const { request } = await appFixture(t);
  const terms = await request('/legal/terms', undefined, 'GET'); assert.equal(terms.status, 200); assert.match(terms.response.headers.get('content-type'), /text\/html/); assert.equal(terms.response.headers.get('cache-control'), 'no-cache');
  assert.equal((await request('/legal/terms', undefined, 'HEAD')).value, ''); assert.equal((await request('/legal/missing.js', undefined, 'GET')).status, 404);
  assert.equal((await request('/legal/terms', {}, 'POST')).status, 405);
  const app = await request('/', undefined, 'GET'); assert.ok([200, 503].includes(app.status));
  assert.equal((await request('/missing-asset.js', undefined, 'GET')).status, 404);
});

test('saved active dispatch and handoffs become interrupted without replay when state is reopened', t => {
  const directory = temp(t); const file = join(directory, 'state.json'); const store = new Store(file); const room = store.addRoom({ name: 'Restart', path: directory }); const agent = store.addAgent({ roomId: room.id, name: 'Codex', provider: 'codex' });
  const message = store.addMessage({ roomId: room.id, text: 'Pending work' }); message.dispatch = { recipients: [{ agentId: agent.id, status: 'running' }, { agentId: 'other', status: 'queued' }, { agentId: 'done', status: 'completed' }] };
  store.data.handoffs.push({ id: 'handoff', roomId: room.id, status: 'already_continuing' }); store.save();
  const reopened = new Store(file); assert.equal(reopened.data.messages[0].dispatch.errors.length, 2); assert.equal(reopened.data.messages[0].dispatch.completed.length, 1); assert.equal(reopened.data.handoffs[0].status, 'interrupted');
});

test('safe startup uses isolated locks, recovers stale locks and releases a failed initialization lock', async t => {
  const directory = temp(t); const common = { dataFile: join(directory, 'state.json'), runtimeDirectory: directory, handleSignals: false, notificationOptions: { intervalMs: 0, nativeIntervalMs: 0 }, managerOptions: { resolveCommand: () => null } };
  for (const port of [0, -1, 65536, 1.5, NaN]) assert.throws(() => startServer({ ...common, port }), /PORT/);
  writeFileSync(join(directory, 'server.lock'), String(process.pid)); assert.throws(() => startServer({ ...common, port: 4319 }), /already running/);
  writeFileSync(join(directory, 'server.lock'), '2147483647');
  const port = await freePort(); const server = startServer({ ...common, port }); await once(server.server, 'listening'); assert.equal(readFileSync(server.lockFile, 'utf8'), String(process.pid)); server.stop(); await once(server.server, 'close'); assert.equal(existsSync(server.lockFile), false);
  writeFileSync(common.dataFile, '{bad'); assert.throws(() => startServer({ ...common, port }), /Cannot load/); assert.equal(existsSync(join(directory, 'server.lock')), false);
});

test('safe startup reports an occupied port and clears only its own lock', async t => {
  const directory = temp(t); const blocker = netServer(); blocker.listen(0, '127.0.0.1'); await once(blocker, 'listening'); t.after(() => blocker.close());
  let failure;
  const app = startServer({ port: blocker.address().port, dataFile: join(directory, 'state.json'), runtimeDirectory: directory, handleSignals: false, onError: error => { failure = error; }, notificationOptions: { intervalMs: 0, nativeIntervalMs: 0 }, managerOptions: { resolveCommand: () => null } });
  await once(app.server, 'error'); assert.equal(failure.code, 'EADDRINUSE'); assert.equal(existsSync(app.lockFile), false); app.stop();
});

test('CLI discovery resolves installed executable/npm entrypoints without executing them', t => {
  const directory = temp(t); const bin = join(directory, 'bin'); mkdirSync(bin);
  assert.equal(resolveCli('codex', { PATH: directory }), null);
  writeFileSync(join(bin, 'codex.cmd'), '@echo off'); assert.equal(resolveCli('codex', { PATH: bin }), null);
  const js = join(bin, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'); mkdirSync(dirname(js), { recursive: true }); writeFileSync(js, '// fixture');
  const resolved = resolveCli('codex', { PATH: bin }); assert.equal(resolved.command, process.execPath); assert.deepEqual(resolved.prefix, [js]);
  writeFileSync(join(bin, 'claude.exe'), 'fixture-not-executed'); assert.equal(resolveCli('claude', { PATH: bin }).command, join(bin, 'claude.exe'));
  const userBin = join(directory, '.local', 'bin'); mkdirSync(userBin, { recursive: true }); writeFileSync(join(userBin, 'claude.exe'), 'fixture'); assert.equal(resolveCli('claude', { PATH: '', USERPROFILE: directory }).command, join(userBin, 'claude.exe'));
  assert.equal(resolveCli('claude', { PATH: '' }), null);
});

test('discovery handles missing native paths, non-Windows status and large records without leaking tools', async t => {
  const directory = temp(t); const home = join(directory, 'home'); const project = join(home, '.claude', 'projects', 'fixture'); mkdirSync(project, { recursive: true });
  writeFileSync(join(project, 'long-session.jsonl'), JSON.stringify({ type: 'user', sessionId: 'long-session', cwd: directory, message: { content: 'a'.repeat(100000) } }) + '\n' + JSON.stringify({ type: 'assistant', sessionId: 'long-session', cwd: directory, message: { content: 'Tail reply' } }) + '\n');
  const result = await discoverSessions({ home, platform: 'linux' }); assert.ok(result.warnings.some(w => /native Windows/.test(w))); assert.equal(result.sessions.length, 1);
  const excerpt = await getSessionContext('claude:long-session', { home, maxChars: 256 }); assert.match(excerpt.excerpt, /Tail reply/);
  const page = await getSessionTranscript('claude:long-session', { home, maxScanBytes: 1024 }); assert.ok(page.messages.length <= 1);
  await assert.rejects(() => getSessionContext('claude:missing-session', { home }), /not found/);
});

test('SSE sends the initial state, propagates updates, caps connections and cleans up disconnected clients', async t => {
  const { app, directory, base, bootstrap } = await appFixture(t);
  const controllers = []; const responses = [];
  try {
    for (let n = 0; n < 20; n++) {
      const controller = new AbortController(); controllers.push(controller);
      responses.push(await fetch(`${base}/api/events`, { headers: { 'x-connect-token': bootstrap.token }, signal: controller.signal }));
    }
    assert.equal(responses[0].status, 200); assert.match(responses[0].headers.get('content-type'), /text\/event-stream/);
    const reader = responses[0].body.getReader(); const initial = new TextDecoder().decode((await reader.read()).value); assert.match(initial, /event: state/);
    app.store.addRoom({ name: 'A live update', path: directory });
    const update = new TextDecoder().decode((await reader.read()).value); assert.match(update, /A live update/);
    assert.equal((await fetch(`${base}/api/events`, { headers: { 'x-connect-token': bootstrap.token } })).status, 429);
    controllers[0].abort(); await reader.cancel().catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 10));
    const replacementController = new AbortController(); controllers.push(replacementController);
    const replacement = await fetch(`${base}/api/events`, { headers: { 'x-connect-token': bootstrap.token }, signal: replacementController.signal }); assert.equal(replacement.status, 200);
  } finally { for (const controller of controllers) controller.abort(); }
});

test('a blocked fallback start rolls task ownership back and reports an actionable human decision', t => {
  const directory = temp(t); const store = new Store(join(directory, 'state.json')); const room = store.addRoom({ name: 'Rollback', path: directory }); store.updateRoom(room.id, { failoverEnabled: true }); store.approvePlan(room.id, { approve: true, text: 'Finish the parser correction.' });
  const source = store.addAgent({ roomId: room.id, name: 'Claude', provider: 'claude', role: 'builder' }); const target = store.addAgent({ roomId: room.id, name: 'Codex', provider: 'codex', role: 'builder' }); source.errorInfo = diagnose('Usage limit reached');
  const task = store.addTask({ roomId: room.id, title: 'Parser task' }); store.updateTask(task.id, { owner: source.id, status: 'in_progress' }); const message = store.addMessage({ roomId: room.id, to: source.id, text: 'Continue the parser work' });
  const manager = new AgentManager(store, { resolveCommand: () => ({ command: 'fixture', prefix: [] }), spawnProcess: () => { throw Object.assign(new Error('spawn EPERM'), { code: 'EPERM' }); } });
  manager.tryFailover(source, { messageId: message.id }); assert.equal(task.owner, source.id); assert.equal(store.data.handoffs[0].status, 'blocked'); assert.equal(target.errorInfo.code, 'SERVER_PROCESS_BLOCKED'); assert.match(store.data.assistance.at(-1).question, /could not start/); manager.close();
});

test('dispatch distinguishes a live relay, an unpaired original terminal, and a paused human decision', t => {
  const directory = temp(t); const store = new Store(join(directory, 'state.json')); const room = store.addRoom({ name: 'Relay status', path: directory }); room.autoReply = true;
  const original = store.addAgent({ roomId: room.id, name: 'Original', provider: 'claude', external: true }); original.sourceSessionId = 'native-target';
  const bridge = store.addAgent({ roomId: room.id, name: 'Relay', provider: 'claude', role: 'bridge' }); bridge.targetSessionId = original.sourceSessionId;
  const peer = store.addAgent({ roomId: room.id, name: 'Codex', provider: 'codex' }); const manager = new AgentManager(store, { resolveCommand: () => null });
  const first = store.addMessage({ roomId: room.id, to: original.id, text: 'Unpaired' }); assert.equal(manager.deliver(first, { run: true }).skipped[0].code, 'EXISTING_SESSION_NOT_ATTACHED');
  const stopped = store.addMessage({ roomId: room.id, to: bridge.id, text: 'Relay stopped' }); assert.equal(manager.deliver(stopped, { run: true }).skipped[0].code, 'LIVE_RELAY_STOPPED');
  bridge.bridgeStatus = 'connected'; manager.running.set(bridge.id, { child: fakeChild() });
  const connected = store.addMessage({ roomId: room.id, to: original.id, text: 'Paired' }); assert.equal(manager.deliver(connected, { run: true }).relaying.length, 1);
  const relay = store.addMessage({ roomId: room.id, to: bridge.id, text: 'Relay listening' }); assert.equal(manager.deliver(relay, { run: true }).relaying.length, 1);
  peer.awaitingAssistance = true; const automated = store.addMessage({ roomId: room.id, from: original.id, to: peer.id, text: 'Another peer message' }); assert.equal(manager.deliver(automated).skipped[0].code, 'WAITING_FOR_HUMAN');
  manager.running.delete(bridge.id); manager.close();
  assert.deepEqual(parseAgentEvent('claude', { type: 'unknown' }), {}); assert.deepEqual(parseAgentEvent('codex', { type: 'unknown' }), {});
});

test('discovery rejects oversized partial records with a bounded transcript continuation cursor', async t => {
  const directory = temp(t); const project = join(directory, '.claude', 'projects', 'fixture'); mkdirSync(project, { recursive: true });
  writeFileSync(join(project, 'partial-session.jsonl'), JSON.stringify({ type: 'user', sessionId: 'partial-session', cwd: directory, message: { content: 'Initial request' } }) + '\n' + 'x'.repeat(5000));
  const page = await getSessionTranscript('claude:partial-session', { home: directory, maxScanBytes: 1024 }); assert.equal(page.messages.length, 0); assert.equal(page.truncated, true); assert.equal(page.hasMore, true); assert.match(page.warnings[0], /exceeds the read window/);
});

test('optional Codex context snapshots omit analysis and environment material just like the chat transcript', async t => {
  const directory = temp(t); const sessions = join(directory, '.codex', 'sessions', '2026'); mkdirSync(sessions, { recursive: true });
  const rows = [
    { type: 'session_meta', payload: { id: 'context-session', cwd: directory } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', channel: 'analysis', content: [{ type: 'output_text', text: 'PRIVATE_ANALYSIS_FIXTURE' }] } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_variables>OPENAI_API_KEY=PRIVATE_KEY_FIXTURE</environment_variables>\nVisible task' }] } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', channel: 'final', content: [{ type: 'output_text', text: 'Visible final response' }] } },
  ];
  writeFileSync(join(sessions, 'context-session.jsonl'), rows.map(row => JSON.stringify(row)).join('\n'));
  const context = await getSessionContext('codex:context-session', { home: directory });
  assert.match(context.excerpt, /Visible task/); assert.match(context.excerpt, /Visible final response/); assert.doesNotMatch(context.excerpt, /PRIVATE_ANALYSIS_FIXTURE|PRIVATE_KEY_FIXTURE|environment_variables/);
});
