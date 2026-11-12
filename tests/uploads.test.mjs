import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter, once } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { Store } from '../lib/store.mjs';
import { Uploads, MAX_UPLOAD_BYTES } from '../lib/uploads.mjs';
import { AgentManager, cliArguments } from '../lib/agents.mjs';
import { createApp } from '../server.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKp8AAAAASUVORK5CYII=', 'base64');
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'connect-upload-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = new Store(join(directory, 'state.json')); return { directory, store, uploads: new Uploads(store) };
}
test('uploads store bytes in UUID paths, redact browser paths, and validate size/type', t => {
  const { directory, store, uploads } = fixture(t); const room = store.addRoom({ name: 'Attachments', path: directory });
  const text = uploads.save({ roomId: room.id, name: '../../review.ts', type: 'text/plain', data: Buffer.from('export const value = 1;').toString('base64') });
  assert.equal(text.name, 'review.ts'); assert.equal(text.path, undefined); assert.equal(text.kind, 'text');
  const stored = store.data.uploads.find(u => u.id === text.id); assert.ok(stored.path.includes(text.id)); assert.ok(stored.path.startsWith(uploads.root)); assert.equal(uploads.get(text.id).bytes.toString(), 'export const value = 1;');
  const image = uploads.save({ roomId: room.id, name: 'screenshot.png', type: 'image/png', data: PNG.toString('base64') }); assert.equal(image.kind, 'image');
  assert.equal(store.snapshot().uploads[0].path, undefined);
  assert.throws(() => uploads.save({ roomId: room.id, name: 'bad.exe', type: 'text/plain', data: 'YWJj' }), /Unsupported/);
  assert.throws(() => uploads.save({ roomId: room.id, name: 'bad.png', data: 'YWJj' }), /image type/);
  assert.throws(() => uploads.save({ roomId: room.id, name: 'bad.pdf', data: 'YWJj' }), /PDF/);
  assert.throws(() => uploads.save({ roomId: room.id, name: 'binary.txt', data: Buffer.from([0, 1]).toString('base64') }), /binary/);
  assert.throws(() => uploads.save({ roomId: room.id, name: 'huge.txt', data: Buffer.alloc(MAX_UPLOAD_BYTES + 1, 65).toString('base64') }), /8 MiB/);
});
test('attachments are room scoped and message context shares only addressed files', t => {
  const { directory, store, uploads } = fixture(t); const first = store.addRoom({ name: 'First', path: directory }); const second = store.addRoom({ name: 'Second', path: directory });
  const a = store.addAgent({ roomId: first.id, name: 'A', provider: 'codex' }); const b = store.addAgent({ roomId: first.id, name: 'B', provider: 'claude' });
  const upload = uploads.save({ roomId: first.id, name: 'notes.md', data: Buffer.from('# Notes').toString('base64') });
  assert.throws(() => store.addMessage({ roomId: second.id, text: 'Wrong room', attachments: [upload.id] }), /this room/);
  assert.throws(() => store.addMessage({ roomId: first.id, attachments: [upload.id, upload.id] }), /only once/);
  const message = store.addMessage({ roomId: first.id, to: a.id, attachments: [upload.id] });
  assert.equal(message.text, 'Please review the attached files.'); assert.equal(message.attachmentDetails[0].path, undefined);
  assert.equal(store.context(a).uploads[0].id, upload.id); assert.ok(store.context(a).uploads[0].path); assert.equal(store.context(b).uploads.length, 0);
});
test('broadcast dispatch supplies the same file paths to both agents and Codex image arguments', t => {
  const { directory, store, uploads } = fixture(t); const room = store.addRoom({ name: 'Both reviewers', path: directory }); const launched = [];
  const manager = new AgentManager(store, { resolveCommand: () => ({ command: 'fake', prefix: [] }), spawnProcess: (command, args) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); let stdin = '';
    child.stdin = new Writable({ write(chunk, encoding, done) { stdin += chunk; done(); } }); child.kill = () => { child.stdout.end(); child.stderr.end(); child.emit('close', null, 'SIGTERM'); };
    launched.push({ args, get prompt() { return stdin; } }); return child;
  } }); t.after(() => manager.close());
  store.addAgent({ roomId: room.id, name: 'Codex', provider: 'codex' }); store.addAgent({ roomId: room.id, name: 'Claude', provider: 'claude' });
  const text = uploads.save({ roomId: room.id, name: 'example.py', data: Buffer.from('print(1)').toString('base64') });
  const image = uploads.save({ roomId: room.id, name: 'example.png', data: PNG.toString('base64') });
  const message = store.addMessage({ roomId: room.id, to: 'all', text: 'Review both files', attachments: [text.id, image.id] });
  manager.deliver(message, { run: true }); assert.equal(launched.length, 2);
  const paths = store.data.uploads.map(u => u.path);
  for (const launch of launched) for (const path of paths) assert.ok(launch.prompt.includes(JSON.stringify(path)));
  assert.equal(launched[0].args[launched[0].args.indexOf('--image') + 1], paths[1]);
  assert.ok(launched[1].args.includes('--add-dir'));
  const resumed = cliArguments({ provider: 'codex', role: 'reviewer', sessionId: 'saved', capabilityToken: 'dummy' }, 'http://127.0.0.1:4318', '', [store.data.uploads[1]]);
  assert.ok(resumed.includes('resume')); assert.ok(resumed.includes('--image'));
  manager.close();
});
test('upload API authenticates downloads, forces attachment disposition and deletes only room uploads', async t => {
  const { directory } = fixture(t);
  const app = createApp({ requireLegalAcceptance: false, dataFile: join(directory, 'api-state.json'), managerOptions: { resolveCommand: () => null }, notificationOptions: { intervalMs: 0, nativeIntervalMs: 0 } }); app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening'); t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`; const { token } = await (await fetch(`${base}/api/bootstrap`)).json();
  const room = app.store.addRoom({ name: 'Uploads', path: directory });
  const response = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-connect-token': token }, body: JSON.stringify({ roomId: room.id, name: 'sample.html', data: Buffer.from('<script>alert(1)</script>').toString('base64') }) });
  assert.equal(response.status, 201); const upload = await response.json(); assert.equal(upload.path, undefined);
  assert.equal((await fetch(`${base}/api/uploads/${upload.id}`)).status, 401);
  const download = await fetch(`${base}/api/uploads/${upload.id}`, { headers: { 'x-connect-token': token } });
  assert.equal(download.status, 200); assert.match(download.headers.get('content-disposition'), /^attachment;/); assert.equal(download.headers.get('content-type'), 'text/plain'); assert.equal(download.headers.get('x-content-type-options'), 'nosniff'); assert.match(await download.text(), /<script>/);
  const file = app.store.data.uploads[0].path; assert.ok(existsSync(file));
  const deletion = await fetch(`${base}/api/rooms/${room.id}`, { method: 'DELETE', headers: { 'content-type': 'application/json', 'x-connect-token': token }, body: JSON.stringify({ confirmName: room.name }) }); assert.equal(deletion.status, 200); assert.equal(existsSync(file), false); assert.equal(app.store.data.uploads.length, 0);
});
