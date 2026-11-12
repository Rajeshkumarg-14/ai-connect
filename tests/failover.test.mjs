import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter, once } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { Store } from '../lib/store.mjs';
import { AgentManager } from '../lib/agents.mjs';
import { Uploads } from '../lib/uploads.mjs';
import { createApp } from '../server.mjs';

function setup(t, { sourceRole = 'builder', targetRole = 'builder', approved = true, maxTurns = 8 } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'connect-failover-')); const children = [];
  const store = new Store(join(directory, 'state.json'));
  const manager = new AgentManager(store, { resolveCommand: () => ({ command: 'fake', prefix: [] }), spawnProcess: (command, args) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); let input = '';
    child.stdin = new Writable({ write(chunk, encoding, done) { input += chunk; done(); } }); child.kill = () => { child.stdout.end(); child.stderr.end(); child.emit('close', null, 'SIGTERM'); };
    children.push({ child, args, get input() { return input; } }); return child;
  } });
  t.after(() => { manager.close(); rmSync(directory, { recursive: true, force: true }); });
  const room = store.addRoom({ name: 'Approved continuation', path: directory }); store.updateRoom(room.id, { failoverEnabled: true, maxTurns });
  if (approved) store.approvePlan(room.id, { approve: true, text: 'Fix the failing parser test and verify the parser behavior. Do not change public APIs.' });
  const source = store.addAgent({ roomId: room.id, name: 'Claude', provider: 'claude', role: sourceRole }); const target = store.addAgent({ roomId: room.id, name: 'Codex', provider: 'codex', role: targetRole });
  return { directory, store, manager, room, source, target, children };
}
function end(child, { quota = false, error = null } = {}) {
  if (quota) child.stdout.write(`${JSON.stringify({ type: 'result', is_error: true, result: "You've hit your 5-hour limit" })}\n`);
  if (error) child.emit('error', error);
  child.stdout.end(); child.stderr.end(); child.emit('close', quota || error ? 1 : 0, null);
}
test('quota failure hands original request and attachments to same-role fallback under approved plan', t => {
  const { directory, store, manager, room, source, target, children } = setup(t);
  const task = store.addTask({ roomId: room.id, title: 'Fix parser behavior' }); store.updateTask(task.id, { owner: source.id, status: 'in_progress' });
  const upload = new Uploads(store).save({ roomId: room.id, name: 'case.json', data: Buffer.from('{"case":1}').toString('base64') });
  const message = store.addMessage({ roomId: room.id, to: source.id, text: 'Continue the approved parser fix.', attachments: [upload.id] });
  manager.deliver(message, { run: true }); end(children[0].child, { quota: true });
  assert.equal(source.errorInfo.code, 'PROVIDER_QUOTA'); assert.equal(children.length, 2); assert.equal(target.status, 'running'); assert.equal(task.owner, target.id);
  assert.equal(message.failoverCount, 1); assert.equal(store.data.handoffs[0].status, 'started'); assert.equal(store.data.handoffs[0].planHash, room.approvedPlan.hash);
  assert.match(children[1].input, /human-approved plan/); assert.match(children[1].input, /Continue the approved parser fix/); assert.match(children[1].input, /case.json/);
  assert.ok(children[1].args.includes('workspace-write')); assert.equal(message.dispatch.errors[0].agentId, source.id); assert.equal(message.dispatch.running[0].agentId, target.id);
  end(children[1].child); assert.equal(store.data.handoffs[0].status, 'completed'); assert.equal(room.turns, 2);
});
test('quota failover never elevates reviewers, ignores unapproved plans, and respects budget and stop', t => {
  const noPlan = setup(t, { approved: false }); const noPlanMessage = noPlan.store.addMessage({ roomId: noPlan.room.id, to: noPlan.source.id, text: 'Do work' }); noPlan.manager.deliver(noPlanMessage, { run: true }); end(noPlan.children[0].child, { quota: true });
  assert.equal(noPlan.children.length, 1); assert.equal(noPlan.store.data.handoffs[0].status, 'blocked'); assert.match(noPlan.store.data.assistance[0].detail, /No human-approved plan/);
  const roles = setup(t, { targetRole: 'reviewer' }); const rolesMessage = roles.store.addMessage({ roomId: roles.room.id, to: roles.source.id, text: 'Do work' }); roles.manager.deliver(rolesMessage, { run: true }); end(roles.children[0].child, { quota: true });
  assert.equal(roles.children.length, 1); assert.equal(roles.target.role, 'reviewer'); assert.match(roles.store.data.assistance[0].detail, /permissions/);
  const budget = setup(t, { maxTurns: 1 }); const budgetMessage = budget.store.addMessage({ roomId: budget.room.id, to: budget.source.id, text: 'Do work' }); budget.manager.deliver(budgetMessage, { run: true }); end(budget.children[0].child, { quota: true });
  assert.equal(budget.children.length, 1); assert.match(budget.store.data.assistance[0].detail, /budget/);
  const stopped = setup(t); const stoppedMessage = stopped.store.addMessage({ roomId: stopped.room.id, to: stopped.source.id, text: 'Do work' }); stopped.manager.deliver(stoppedMessage, { run: true }); stopped.manager.stopRoom(stopped.room.id);
  assert.equal(stopped.children.length, 1); assert.equal(stopped.store.data.handoffs.length, 0);
});
test('process failures do not trigger failover and a request can hand off only once', t => {
  const blocked = setup(t); const message = blocked.store.addMessage({ roomId: blocked.room.id, to: blocked.source.id, text: 'Work' }); blocked.manager.deliver(message, { run: true }); end(blocked.children[0].child, { error: Object.assign(new Error('spawn EPERM'), { code: 'EPERM' }) });
  assert.equal(blocked.children.length, 1); assert.equal(blocked.store.data.handoffs.length, 0);
  const quota = setup(t, { sourceRole: 'reviewer', targetRole: 'reviewer' }); const original = quota.store.addMessage({ roomId: quota.room.id, to: quota.source.id, text: 'Review' }); quota.manager.deliver(original, { run: true }); end(quota.children[0].child, { quota: true });
  quota.children[1].child.stdout.write(`${JSON.stringify({ type: 'error', message: 'Usage limit reached' })}\n`); end(quota.children[1].child, { error: new Error('Usage limit reached') });
  assert.equal(quota.children.length, 2); assert.equal(original.failoverCount, 1); assert.match(quota.store.data.assistance.at(-1).detail, /one automatic handoff/);
});
test('broadcast quota failure recognizes the compatible agent already processing that same approved request', t => {
  const { store, manager, room, source, target, children } = setup(t, { sourceRole: 'reviewer', targetRole: 'reviewer', maxTurns: 2 });
  const task = store.addTask({ roomId: room.id, title: 'Independent review' }); store.updateTask(task.id, { owner: source.id, status: 'in_progress' });
  const message = store.addMessage({ roomId: room.id, to: 'all', text: 'Review the parser under the approved plan.' });
  manager.deliver(message, { run: true }); assert.equal(children.length, 2); assert.equal(room.turns, 2);
  end(children[0].child, { quota: true });
  assert.equal(children.length, 2); assert.equal(room.turns, 2); assert.equal(target.status, 'running'); assert.equal(message.failoverCount, 1);
  assert.equal(store.data.handoffs[0].status, 'already_continuing'); assert.equal(store.data.assistance.length, 0); assert.equal(task.owner, source.id);
  end(children[1].child); assert.equal(store.data.handoffs[0].status, 'completed');
});
test('plan approval is admin-only and explicit assistance responses resolve and run the chosen message', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'connect-plan-api-'));
  const app = createApp({ requireLegalAcceptance: false, dataFile: join(directory, 'state.json'), managerOptions: { resolveCommand: () => null }, notificationOptions: { intervalMs: 0, nativeIntervalMs: 0 } }); app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening'); t.after(() => { app.close(); rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${app.server.address().port}`; const { token } = await (await fetch(`${base}/api/bootstrap`)).json(); const room = app.store.addRoom({ name: 'Plan', path: directory }); const agent = app.store.addAgent({ roomId: room.id, name: 'Codex', provider: 'codex' });
  const post = async (path, data, auth = true) => { const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { 'x-connect-token': token } : {}) }, body: JSON.stringify(data) }); return { status: response.status, value: await response.json() }; };
  assert.equal((await post(`/api/rooms/${room.id}/plan`, { text: 'Fix parser', approve: true }, false)).status, 401);
  assert.equal((await post(`/api/rooms/${room.id}/plan`, { text: 'Fix parser' })).status, 400);
  const plan = await post(`/api/rooms/${room.id}/plan`, { text: 'Fix parser', approve: true }); assert.ok(plan.value.hash); assert.ok(plan.value.approvedAt);
  const assistance = app.manager.requestAssistance(agent, { question: 'Can the public API change?', detail: 'The plan forbids this.' }); assert.equal(agent.awaitingAssistance, true);
  const response = await post(`/api/assistance/${assistance.id}/respond`, { text: 'Keep the public API unchanged.', run: false }); assert.equal(response.status, 200); assert.equal(response.value.assistance.status, 'resolved'); assert.equal(response.value.message.to, agent.id); assert.equal(response.value.dispatch.requested, false); assert.equal(agent.awaitingAssistance, false);
});
