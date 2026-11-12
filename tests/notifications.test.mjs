import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Store } from '../lib/store.mjs';
import { NotificationCenter, NativeSessionNotifications, patchNotificationSettings, isQuietTime } from '../lib/notifications.mjs';
import { createApp } from '../server.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'connect-notification-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, store: new Store(join(directory, 'state.json')) };
}
test('notification preferences validate atomically and quiet hours use the selected timezone', t => {
  const { store } = fixture(t);
  assert.equal(store.data.settings.notifications.browser, false);
  assert.throws(() => patchNotificationSettings(store.data, { enabled: false, quietStart: '29:00' }), /HH:MM/);
  assert.equal(store.data.settings.notifications.enabled, true);
  patchNotificationSettings(store.data, { quietHoursEnabled: true, quietStart: '22:00', quietEnd: '08:00', timezone: 'Asia/Kolkata' });
  assert.equal(isQuietTime(store.data.settings.notifications, new Date('2026-11-12T17:00:00Z')), true);
  assert.equal(isQuietTime(store.data.settings.notifications, new Date('2026-11-12T05:00:00Z')), false);
  assert.throws(() => patchNotificationSettings(store.data, { timezone: 'Unknown/Place' }), /timezone/);
});
test('managed notifications respect session, category and global preferences and cap history', t => {
  const { directory, store } = fixture(t); const emitted = [];
  const room = store.addRoom({ name: 'A', path: directory }); const agent = store.addAgent({ roomId: room.id, name: 'Codex', provider: 'codex' });
  const center = new NotificationCenter(store, { intervalMs: 0, emit: (event, item) => emitted.push(item) }); t.after(() => center.close());
  center.agent(agent, 'reply', 'A concrete answer'); assert.equal(store.data.notifications.length, 1);
  store.data.settings.notifications.perSession[agent.id] = false;
  assert.equal(center.agent(agent, 'reply', 'Muted answer'), null);
  store.data.settings.notifications.perSession[agent.id] = true; store.data.settings.notifications.notifyOnError = false;
  assert.equal(center.agent(agent, 'error', 'Muted error'), null);
  store.data.settings.notifications.enabled = false; assert.equal(center.agent(agent, 'reply', 'Global mute'), null);
  store.data.settings.notifications.enabled = true;
  for (let n = 0; n < 205; n++) center.agent(agent, 'reply', `Reply ${n}`);
  assert.equal(store.data.notifications.length, 200); assert.equal(emitted.length, 206);
});
test('custom reminders defer during quiet hours, fire once, persist and never replay after restart', t => {
  const { store } = fixture(t); let current = new Date('2026-11-12T16:29:00Z');
  const center = new NotificationCenter(store, { intervalMs: 0, now: () => current });
  center.custom({ title: 'Review progress', message: 'Check the remaining findings', scheduledAt: '2026-11-12T16:31:00Z' });
  patchNotificationSettings(store.data, { quietHoursEnabled: true, quietStart: '22:00', quietEnd: '08:00' });
  current = new Date('2026-11-12T16:32:00Z'); center.tick();
  assert.equal(store.data.customNotifications[0].firedAt, null); assert.equal(store.data.notifications.length, 0);
  current = new Date('2026-11-13T03:00:00Z'); center.tick(); center.tick();
  assert.equal(store.data.notifications.length, 1); assert.ok(store.data.customNotifications[0].firedAt); center.close();
  const restarted = new Store(store.file); const next = new NotificationCenter(restarted, { intervalMs: 0, now: () => current }); t.after(() => next.close()); next.tick();
  assert.equal(restarted.data.notifications.length, 1);
  assert.throws(() => next.custom({ title: 'Past', message: 'No', scheduledAt: '2000-01-01T00:00:00Z' }), /future/);
});
test('opted-in native session notifications establish a baseline and notify only new assistant replies', async t => {
  const { store } = fixture(t); const id = 'claude:native-session'; let calls = 0;
  let messages = [{ id: 'one', role: 'assistant', text: 'Historical reply' }];
  const reader = async () => { calls++; return { session: { title: 'Native session' }, messages }; };
  const center = new NotificationCenter(store, { intervalMs: 0 }); const monitor = new NativeSessionNotifications(store, center, reader, { intervalMs: 0 }); t.after(() => { monitor.close(); center.close(); });
  await monitor.tick(); assert.equal(calls, 0, 'native transcripts are not polled without explicit opt-in');
  store.data.settings.notifications.perSession[id] = true;
  await monitor.baseline(id); await monitor.tick(); assert.equal(store.data.notifications.length, 0);
  messages = [...messages, { id: 'two', role: 'user', text: 'Task' }, { id: 'three', role: 'assistant', text: 'New answer' }];
  await monitor.tick(); await monitor.tick(); assert.equal(store.data.notifications.length, 1); assert.equal(store.data.notifications[0].message, 'New answer');
  store.archiveSession(id, true); messages.push({ id: 'four', role: 'assistant', text: 'Hidden reply' }); await monitor.tick(); assert.equal(store.data.notifications.length, 1);
});
test('notification and archive APIs authenticate, preserve native files and delete only a confirmed Connect room', async t => {
  const { directory } = fixture(t); const nativeFile = join(directory, 'native-transcript.jsonl'); writeFileSync(nativeFile, 'original native history');
  const app = createApp({ requireLegalAcceptance: false, dataFile: join(directory, 'api-state.json'), notificationOptions: { intervalMs: 0, nativeIntervalMs: 0 }, managerOptions: { resolveCommand: () => null }, transcriptReader: async () => ({ messages: [] }) });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening'); t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`; const { token } = await (await fetch(`${base}/api/bootstrap`)).json();
  const request = async (path, data, method = 'POST', authenticated = true) => {
    const response = await fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...(authenticated ? { 'x-connect-token': token } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await request('/api/settings', undefined, 'GET', false)).status, 401);
  assert.equal((await request('/api/settings', { notifications: { browser: true } }, 'PATCH')).data.notifications.browser, true);
  const room = app.store.addRoom({ name: 'Keep native files', path: directory }); const agent = app.store.addAgent({ roomId: room.id, name: 'Reviewer', provider: 'codex' });
  app.store.addMessage({ roomId: room.id, text: 'Saved history' });
  const muted = await request('/api/session-notifications', { sessionId: agent.id, enabled: false }, 'PATCH'); assert.equal(muted.data.enabled, false);
  const reminder = await request('/api/notifications/custom', { title: 'Review tomorrow', message: 'Check results', scheduledAt: '2099-01-01T10:00:00Z' }); assert.equal(reminder.status, 201);
  assert.equal((await request(`/api/notifications/custom/${reminder.data.id}`, { enabled: false }, 'PATCH')).data.enabled, false);
  assert.equal((await request(`/api/notifications/custom/${reminder.data.id}`, undefined, 'DELETE')).status, 200);
  const archived = await request(`/api/rooms/${room.id}/archive`, { archived: true }); assert.equal(archived.data.archived, true); assert.equal(app.store.data.messages.length, 1);
  assert.equal(app.manager.enqueue(agent.id, 'Do not run archived work').code, 'ROOM_ARCHIVED');
  assert.equal((await request(`/api/rooms/${room.id}/archive`, { archived: false })).data.archived, false);
  const hidden = await request('/api/sessions/claude%3Anative-session/archive', { archived: true }); assert.equal(hidden.data.nativeSessionChanged, false);
  assert.equal((await request(`/api/rooms/${room.id}`, { confirmName: 'wrong' }, 'DELETE')).status, 400); assert.equal(app.store.data.rooms.length, 1);
  const deleted = await request(`/api/rooms/${room.id}`, { confirmName: room.name }, 'DELETE'); assert.equal(deleted.data.deleted, true); assert.equal(app.store.data.rooms.length, 0); assert.equal(app.store.data.agents.length, 0); assert.equal(app.store.data.messages.length, 0);
  assert.equal(readFileSync(nativeFile, 'utf8'), 'original native history');
});
