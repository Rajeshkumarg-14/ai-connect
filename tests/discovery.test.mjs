import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { discoverSessions, getSessionContext, getSessionTranscript, parseProcessRows } from '../lib/discovery.mjs';

async function fixture(t) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'connect-discovery-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(home)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(home).startsWith('connect-discovery-'));
    return rm(home, { recursive: true, force: true });
  });
  const cwd = path.join(home, 'project');
  const directory = path.join(home, '.claude', 'projects', 'project');
  await mkdir(cwd, { recursive: true }); await mkdir(directory, { recursive: true });
  const sessionId = '12345678-1234-1234-1234-123456789abc';
  const transcript = path.join(directory, `${sessionId}.jsonl`);
  const messages = [
    { type: 'user', sessionId, cwd, message: { content: 'Private task: investigate the parser.' } },
    { type: 'assistant', sessionId, cwd, message: { content: [{ type: 'thinking', thinking: 'hidden reasoning' }, { type: 'text', text: 'Found the parser edge case.' }] } },
    { type: 'user', sessionId, cwd, message: { content: [{ type: 'tool_result', content: 'secret tool output' }] } },
  ];
  await writeFile(transcript, messages.map(row => JSON.stringify(row)).join('\n') + '\n');
  return { home, cwd, sessionId, transcript };
}

test('recent transcript is never misrepresented as a running session or leaks messages', async t => {
  const data = await fixture(t);
  const found = await discoverSessions({ home: data.home, processes: [] });
  assert.equal(found.sessions.length, 1);
  assert.equal(found.sessions[0].status, 'recent');
  assert.equal(found.sessions[0].attachment, 'context-only');
  assert.equal(found.sessions[0].importable, true);
  assert.doesNotMatch(JSON.stringify(found), /Private task|hidden reasoning|secret tool output/);
});

test('only exact process/session identity proves a running session', async t => {
  const data = await fixture(t);
  const found = await discoverSessions({ home: data.home, processes: [
    { ProcessId: 31, Name: 'claude.exe', CommandLine: `claude.exe --resume ${data.sessionId}` },
    { ProcessId: 32, Name: 'claude.exe', CommandLine: 'claude.exe -p "private prompt"' },
  ] });
  assert.equal(found.sessions[0].status, 'running'); assert.equal(found.sessions[0].pid, 31);
  assert.equal(found.processes.length, 2);
  assert.doesNotMatch(JSON.stringify(found), /private prompt|CommandLine/);
  assert.match(found.warnings[0], /without a verified/);
});

test('context requires explicit getter and excludes tools and reasoning', async t => {
  const data = await fixture(t);
  const found = await getSessionContext(`claude:${data.sessionId}`, { home: data.home });
  assert.match(found.excerpt, /Private task/); assert.match(found.excerpt, /parser edge case/);
  assert.doesNotMatch(found.excerpt, /hidden reasoning|secret tool output/);
  assert.match(found.notice, /snapshot/);
  await assert.rejects(getSessionContext('../../private', { home: data.home }), /Invalid/);
});

test('Codex metadata is recognized and old unverified sessions are excluded', async t => {
  const data = await fixture(t);
  const directory = path.join(data.home, '.codex', 'sessions', '2026', '11', '12');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'rollout-session.jsonl');
  await writeFile(file, JSON.stringify({ type: 'session_meta', payload: { id: 'codex-session-123456', cwd: data.cwd } }) + '\n');
  const longAgo = new Date(Date.now() - 40 * 86400000); await utimes(data.transcript, longAgo, longAgo);
  const found = await discoverSessions({ home: data.home, processes: [] });
  assert.equal(found.sessions.length, 1); assert.equal(found.sessions[0].provider, 'codex');
  assert.equal(found.scope.historyDays, 30); assert.equal(found.scope.bounded, true);
});

test('process parser distinguishes CLI from desktop and never returns argv', () => {
  const result = parseProcessRows([
    { Name: 'node.exe', ProcessId: 11, CommandLine: 'node "C:\\npm\\@openai\\codex\\bin\\codex.js" exec -C "P:\\Projects\\demo" -' },
    { Name: 'Codex.exe', ProcessId: 12, CommandLine: 'C:\\Program Files\\Codex\\Codex.exe' },
    { Name: 'node.exe', ProcessId: 13, CommandLine: 'node mycodex.js' },
  ]);
  assert.equal(result.length, 1); assert.equal(result[0].provider, 'codex'); assert.equal(result[0].cwd, 'P:\\Projects\\demo');
  assert.equal(result[0].command, undefined);
});

test('Claude live session registry identifies an ordinary interactive launch', async t => {
  const data = await fixture(t);
  const directory = path.join(data.home, '.claude', 'sessions');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, '777.json'), JSON.stringify({ pid: 777, sessionId: data.sessionId, cwd: data.cwd }));
  const live = await discoverSessions({ home: data.home, processes: [{ Name: 'claude.exe', ProcessId: 777, CommandLine: 'claude.exe' }], checkPid: pid => pid === 777 });
  assert.equal(live.sessions.length, 1); assert.equal(live.sessions[0].status, 'running');
  assert.match(live.sessions[0].evidence, /registry/);
  const stale = await discoverSessions({ home: data.home, processes: [], checkPid: () => false });
  assert.equal(stale.sessions[0].status, 'recent');
});

test('transcript pagination is chronological, stable, and does not repeat messages', async t => {
  const data = await fixture(t);
  const records = Array.from({ length: 9 }, (_, index) => ({
    type: index % 2 ? 'assistant' : 'user', sessionId: data.sessionId, cwd: data.cwd,
    timestamp: `2026-11-12T12:00:0${index}.000Z`, message: { content: `Message ${index} with unicode café 日本語` },
  }));
  await writeFile(data.transcript, records.map(row => JSON.stringify(row)).join('\n') + '\n');
  const last = await getSessionTranscript(`claude:${data.sessionId}`, { home: data.home, limit: 3 });
  assert.deepEqual(last.messages.map(row => row.text), records.slice(6).map(row => row.message.content));
  assert.equal(last.hasMore, true);
  const middle = await getSessionTranscript(data.sessionId, { home: data.home, provider: 'claude', limit: 3, before: last.nextCursor });
  assert.deepEqual(middle.messages.map(row => row.text), records.slice(3, 6).map(row => row.message.content));
  const first = await getSessionTranscript(`claude:${data.sessionId}`, { home: data.home, limit: 3, before: middle.nextCursor });
  assert.deepEqual(first.messages.map(row => row.text), records.slice(0, 3).map(row => row.message.content));
  assert.equal(first.hasMore, false); assert.equal(first.nextCursor, null);
  assert.equal(new Set([...first.messages, ...middle.messages, ...last.messages].map(row => row.id)).size, 9);
  assert.equal(last.messages[0].timestamp, '2026-11-12T12:00:06.000Z');
});

test('transcript omits tool output, reasoning, system blocks and environment credentials', async t => {
  const data = await fixture(t);
  await writeFile(data.transcript, [
    { type: 'user', sessionId: data.sessionId, cwd: data.cwd, message: { content: '<environment_context>private environment</environment_context>Question\nOPENAI_API_KEY=secret-value' } },
    { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'secret thought' }, { type: 'tool_use', name: 'Read' }, { type: 'text', text: 'Useful answer' }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'secret tool response' }] } },
    { type: 'user', message: { content: '<system-reminder>internal instruction</system-reminder>' } },
    { type: 'user', message: { content: '# AGENTS.md instructions\n<INSTRUCTIONS>internal config</INSTRUCTIONS>' } },
    { type: 'progress', data: { text: 'internal progress' } },
  ].map(row => JSON.stringify(row)).join('\n') + '\n{malformed');
  const result = await getSessionTranscript(`claude:${data.sessionId}`, { home: data.home });
  assert.equal(result.messages.length, 2);
  assert.match(result.messages[0].text, /Question/); assert.match(result.messages[0].text, /\[redacted\]/);
  assert.doesNotMatch(JSON.stringify(result), /private environment|secret-value|secret thought|secret tool response|internal instruction|internal config|internal progress/);
});

test('Codex transcript shows user and final/commentary assistant text without analysis and tools', async t => {
  const data = await fixture(t);
  const directory = path.join(data.home, '.codex', 'sessions', '2026', '11', '12');
  const id = 'codex-session-123456'; await mkdir(directory, { recursive: true });
  const records = [
    { type: 'session_meta', payload: { id, cwd: data.cwd } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Review this code' }] } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', channel: 'analysis', content: [{ type: 'output_text', text: 'private analysis' }] } },
    { type: 'response_item', payload: { type: 'function_call_output', output: 'private output' } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', channel: 'final', content: [{ type: 'output_text', text: 'Review complete' }] } },
  ];
  await writeFile(path.join(directory, `rollout-${id}.jsonl`), records.map(row => JSON.stringify(row)).join('\n'));
  const result = await getSessionTranscript(`codex:${id}`, { home: data.home });
  assert.deepEqual(result.messages.map(row => row.text), ['Review this code', 'Review complete']);
  assert.equal(result.hasMore, false);
  await assert.rejects(getSessionTranscript(`claude:${id}`, { home: data.home }), error => error.status === 404);
});

test('transcript reader validates IDs/cursors and bounds large reads', async t => {
  const data = await fixture(t);
  await assert.rejects(getSessionTranscript('../../file', { home: data.home }), error => error.status === 400);
  await assert.rejects(getSessionTranscript(data.sessionId, { home: data.home, provider: 'claude', before: '-1' }), error => error.status === 400);
  await assert.rejects(getSessionTranscript(data.sessionId, { home: data.home, provider: 'claude', before: '99999999999' }), error => error.status === 400);
  await assert.rejects(getSessionTranscript('claude:unknown-123456', { home: data.home }), error => error.status === 404);
  const records = [{ type: 'user', sessionId: data.sessionId, cwd: data.cwd, message: { content: 'Original message' } },
    ...Array.from({ length: 40 }, () => ({ type: 'progress', content: 'x'.repeat(200) })),
    { type: 'assistant', message: { content: 'Recent message' } }];
  await writeFile(data.transcript, records.map(row => JSON.stringify(row)).join('\n') + '\n');
  const page = await getSessionTranscript(`claude:${data.sessionId}`, { home: data.home, maxScanBytes: 1024 });
  assert.deepEqual(page.messages.map(row => row.text), ['Recent message']);
  assert.equal(page.truncated, true); assert.equal(page.hasMore, true); assert.ok(page.warnings.length);
});
