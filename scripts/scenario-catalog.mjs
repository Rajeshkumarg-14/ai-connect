import { pathToFileURL } from 'node:url';

/** Shared scenario definitions. Each entry becomes an actual Node test case. */
export function scenarioCatalog() {
  const rows = [];
  const add = (category, params) => rows.push({ id: `${category}-${String(rows.filter(r => r.category === category).length + 1).padStart(4, '0')}`, category, params });
  const bools = [false, true];
  for (let mask = 0; mask < 128; mask++) for (const kind of ['reply', 'error', 'custom']) add('notification-channels', { mask, kind });
  for (const timezone of ['UTC', 'Asia/Kolkata', 'America/New_York']) for (const window of ['overnight', 'daytime', 'all-day', 'disabled']) for (let hour = 0; hour < 24; hour++) add('quiet-hours', { timezone, window, hour });
  for (const override of ['unset', 'enabled', 'muted']) for (const enabled of bools) for (const archived of bools) for (const hidden of bools) for (const kind of ['reply', 'error', 'assistance']) add('notification-overrides', { override, enabled, archived, hidden, kind });
  for (const sourceProvider of ['claude', 'codex']) for (const sourceRole of ['reviewer', 'builder']) for (const targetRole of ['reviewer', 'builder']) for (const targetStatus of ['idle', 'running', 'error', 'stopped']) for (const approved of bools) for (const enabled of bools) for (const budget of ['available', 'exhausted']) add('quota-handoff', { sourceProvider, sourceRole, targetRole, targetStatus, approved, enabled, budget });
  for (const field of ['room-name', 'agent-name', 'message', 'task-title', 'finding-title', 'finding-detail']) for (const value of ['minimum', 'maximum', 'over-limit', 'whitespace', 'empty', 'number', 'null', 'object']) add('input-boundaries', { field, value });
  for (const field of ['autoReply', 'failoverEnabled', 'maxTurns', 'fallbackAgentId']) for (const value of ['true', 'false', 'zero', 'one', 'fifty', 'fifty-one', 'fraction', 'text', 'null', 'object']) add('room-update', { field, value });
  for (const provider of ['claude', 'codex']) for (const role of ['reviewer', 'builder']) for (const ownership of ['unowned', 'self', 'other']) for (const sameRoom of bools) for (const status of ['open', 'in_progress', 'done']) add('task-ownership', { provider, role, ownership, sameRoom, status });
  for (const severity of ['low', 'medium', 'high']) for (const status of ['open', 'resolved', 'disputed']) for (const sameRoom of bools) add('finding-transitions', { severity, status, sameRoom });
  for (const shape of ['null', 'array', 'string', 'number', 'boolean', 'empty', 'bad-version', 'missing-version', 'bad-method', 'missing-method', 'object-id', 'array-id', 'boolean-id', 'infinite-id', 'null-params', 'array-params', 'string-params', 'number-params', 'boolean-params']) add('mcp-invalid-envelope', { shape });
  for (const id of ['zero', 'positive', 'negative', 'string', 'empty-string', 'null']) for (const method of ['ping', 'initialize', 'tools/list', 'unknown', 'tools/call']) add('mcp-request-id', { id, method });
  for (const tool of ['room_context', 'send_message', 'list_tasks', 'claim_task', 'update_task', 'report_finding', 'request_assistance', 'wait_for_messages', 'bridge_status']) for (const outcome of ['success', 'error-object', 'error-string', 'invalid-arguments']) add('mcp-tool-outcomes', { tool, outcome });
  for (const version of ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25', 'future-unknown', 'missing']) add('mcp-version', { version });
  for (const extension of ['txt', 'md', 'json', 'csv', 'tsv', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'h', 'cpp', 'css', 'sql', 'yaml', 'toml']) for (const prefix of ['plain', 'traversal', 'windows-path']) add('upload-source', { extension, prefix });
  for (const shape of ['empty-data', 'empty-name', 'bad-base64', 'bad-padding', 'data-url', 'binary-text', 'exe', 'zip', 'svg', 'fake-png', 'fake-jpg', 'fake-webp', 'fake-pdf', 'missing-room', 'archived-room', 'oversize']) add('upload-invalid', { shape });
  for (const type of ['png', 'jpg', 'webp', 'pdf']) for (const count of [1, 2, 5]) add('upload-attachments', { type, count });
  for (const route of ['/api/state', '/api/settings', '/api/runtime/status', '/api/discover', '/api/events', '/api/uploads', '/api/rooms', '/api/agents', '/api/messages', '/api/tasks', '/api/findings', '/api/session-notifications', '/api/notifications/custom', '/api/notifications/test', '/api/import-session', '/api/rooms/missing/plan', '/api/rooms/missing/archive', '/api/sessions/claude%3Amissing-session/archive']) for (const auth of ['missing', 'wrong-token', 'cross-origin', 'wrong-host']) add('http-auth', { route, auth });
  for (const payload of ['null', 'array', 'empty', 'malformed', 'number', 'string', 'boolean', 'oversized']) for (const contentType of ['json', 'plain', 'missing']) add('http-body', { payload, contentType });
  for (const identifier of ['../outside', '..\\outside', 'a', '', 'claude:', 'codex:../escape', 'other:valid-session', 'claude:valid:extra', 'claude:invalid/session', 'codex:invalid\\session', 'claude:valid-session', 'codex:valid-session']) for (const provider of ['claude', 'codex', 'invalid']) add('transcript-identifiers', { identifier, provider });
  for (const before of ['negative', 'fraction', 'text', 'object', 'too-long', 'beyond-end', 'zero', 'exact-end', 'one', 'leading-zero', 'null', 'missing']) add('transcript-cursors', { before });
  for (const provider of ['claude', 'codex']) for (const limit of [1, 2, 7, 50, 100, 500]) for (const position of ['newest', 'earlier']) add('transcript-pages', { provider, limit, position });
  for (const corruption of ['empty', 'malformed', 'null', 'array', 'wrong-version', 'missing-collections', 'bad-rooms', 'bad-agents']) add('persistence-corruption', { corruption });
  for (const role of ['reviewer', 'builder', 'bridge']) for (const status of ['running', 'queued', 'error', 'idle', 'stopped']) add('persistence-restart', { role, status });
  for (const provider of ['claude', 'codex']) for (const role of ['reviewer', 'builder']) for (const queued of [0, 7, 8, 9]) add('queue-saturation', { provider, role, queued });
  for (const provider of ['claude', 'codex']) for (const action of ['timeout', 'stop', 'close', 'output-limit', 'disconnect']) add('worker-lifecycle', { provider, action });
  for (const action of ['zero-timeout', 'bounded-timeout', 'abort-before', 'abort-after', 'room-stop', 'new-message']) add('message-wait', { action });
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenarios = scenarioCatalog();
  const counts = Object.fromEntries([...new Set(scenarios.map(s => s.category))].map(category => [category, scenarios.filter(s => s.category === category).length]));
  console.log(JSON.stringify({ total: scenarios.length, categories: counts, ...(process.argv.includes('--full') ? { scenarios } : {}) }, null, 2));
}
