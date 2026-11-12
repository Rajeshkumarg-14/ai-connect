import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server.mjs';
import { LEGAL_VERSION, legalStatus, acceptLegal } from '../lib/legal.mjs';
import { generateManifest, verifyManifest } from '../scripts/integrity.mjs';

test('production-default legal acceptance gates reads, changes, agent tools, and native scans until an explicit versioned decision', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'connect-legal-')); let discovered = 0;
  const app = createApp({ dataFile: join(directory, 'state.json'), discover: async () => { discovered++; return { sessions: [] }; }, notificationOptions: { intervalMs: 0, nativeIntervalMs: 0 }, managerOptions: { resolveCommand: () => null } });
  t.after(() => { app.close(); rmSync(directory, { recursive: true, force: true }); }); app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  const base = `http://127.0.0.1:${app.server.address().port}`, boot = await (await fetch(`${base}/api/bootstrap`)).json();
  assert.equal(boot.legal.required, true); assert.equal(discovered, 0);
  const request = (path, body, method = body === undefined ? 'GET' : 'POST') => fetch(`${base}${path}`, { method, headers: { 'x-connect-token': boot.token, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal((await request('/api/discover')).status, 428); assert.equal(discovered, 0);
  assert.equal((await request('/api/rooms', { name: 'Blocked', path: directory })).status, 428);
  assert.equal((await request('/api/legal/accept', { termsVersion: LEGAL_VERSION, privacyVersion: LEGAL_VERSION, accepted: true, providerAcknowledged: false })).status, 400);
  assert.equal((await request('/api/legal/accept', { termsVersion: 'old', privacyVersion: LEGAL_VERSION, accepted: true, providerAcknowledged: true })).status, 409);
  assert.equal((await request('/api/legal/accept', { termsVersion: LEGAL_VERSION, privacyVersion: LEGAL_VERSION, accepted: true, providerAcknowledged: true })).status, 200);
  assert.equal((await request('/api/discover')).status, 200); assert.equal(discovered, 1);
  const room = app.store.addRoom({ name: 'Approved local workspace', path: directory }); room.autoReply = true;
  const persisted = JSON.parse(readFileSync(join(directory, 'state.json'), 'utf8')); assert.equal(persisted.legalAcceptance.providerAcknowledged, true); assert.ok(persisted.legalAcceptance.acceptedAt);
  assert.equal((await request('/api/legal/revoke', {})).status, 200); assert.equal(room.autoReply, false); assert.equal(legalStatus(app.store.data).required, true);
});
test('legal notices require current versions and never approve a plan', () => {
  const store = { data: { rooms: [{ approvedPlan: null }] }, save() {} };
  assert.throws(() => acceptLegal(store, { accepted: 1, providerAcknowledged: true }), /Explicit/);
  const result = acceptLegal(store, { accepted: true, providerAcknowledged: true, termsVersion: LEGAL_VERSION, privacyVersion: LEGAL_VERSION });
  assert.equal(result.required, false); assert.equal(store.data.rooms[0].approvedPlan, null);
  store.data.legalAcceptance.privacyVersion = 'outdated'; assert.equal(legalStatus(store.data).required, true);
});
test('integrity verification detects tampering, new/missing files, and unsafe manifest paths', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'connect-integrity-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'src')); writeFileSync(join(directory, 'src', 'example.js'), 'export const value=1;');
  const manifest = await generateManifest(directory); assert.equal(await verifyManifest(manifest, directory), 1);
  writeFileSync(join(directory, 'src', 'example.js'), 'export const value=2;'); await assert.rejects(verifyManifest(manifest, directory), /Integrity mismatch/);
  writeFileSync(join(directory, 'src', 'example.js'), 'export const value=1;'); writeFileSync(join(directory, 'src', 'extra.js'), 'changed'); await assert.rejects(verifyManifest(manifest, directory), /Integrity mismatch/);
  await assert.rejects(verifyManifest({ ...manifest, files: [{ path: '../secret', sha256: '0'.repeat(64) }] }, directory), /Invalid path/);
});
