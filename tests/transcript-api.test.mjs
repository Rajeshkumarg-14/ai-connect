import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { createApp } from '../server.mjs';

test('transcript endpoint authenticates, forwards paging and never launches or imports an agent', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'connect-transcript-api-'));
  let calls = [];
  const app = createApp({ requireLegalAcceptance: false, dataFile: path.join(directory, 'state.json'), managerOptions: { resolveCommand: () => null },
    transcriptReader: async (id, options) => {
      calls.push({ id, options });
      if (id === 'claude:missing-session') { const error = new Error('Session transcript was not found.'); error.status = 404; throw error; }
      return { session: { id }, messages: [{ id: 'test:12', role: 'user', text: 'Fixture message', timestamp: null }], hasMore: true, nextCursor: '12', truncated: false, warnings: [] };
    } });
  t.after(async () => {
    app.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('connect-transcript-api-'));
    await rm(directory, { recursive: true, force: true });
  });
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const endpoint = `${base}/api/sessions/${encodeURIComponent('claude:fixture-session')}/transcript?provider=claude&before=99&limit=25`;
  assert.equal((await fetch(endpoint)).status, 401); assert.equal(calls.length, 0);
  const bootstrap = await (await fetch(`${base}/api/bootstrap`)).json();
  const headers = { 'x-connect-token': bootstrap.token };
  const response = await fetch(endpoint, { headers });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).messages[0].text, 'Fixture message');
  assert.deepEqual(calls[0], { id: 'claude:fixture-session', options: { provider: 'claude', before: '99', limit: '25' } });
  assert.equal((await fetch(endpoint, { headers: { ...headers, origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(`${base}/api/sessions/claude%3Amissing-session/transcript`, { headers })).status, 404);
  assert.equal(app.store.data.rooms.length, 0); assert.equal(app.store.data.agents.length, 0); assert.equal(app.manager.running.size, 0);
});
