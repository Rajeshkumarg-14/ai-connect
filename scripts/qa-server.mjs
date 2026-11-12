// Isolated browser fixtures. Never reads native session transcripts or launches models.
import { createApp } from '../server.mjs';
import { resolve } from 'node:path';
const project = resolve(import.meta.dirname, '..');
const recent = { id: 'codex:qa-session-000001', sessionId: 'qa-session-000001', provider: 'codex', cwd: project, title: 'Synthetic QA conversation', lastActive: new Date().toISOString(), status: 'recent', importable: true, attachment: 'context-only', evidence: 'Synthetic browser fixture; no coding process is running.' };
const old = { ...recent, id: 'claude:qa-session-000002', sessionId: 'qa-session-000002', provider: 'claude', title: 'Older synthetic conversation', lastActive: new Date(Date.now() - 10 * 86400000).toISOString() };
const app = createApp({ requireLegalAcceptance: false,
  dataFile: resolve(project, 'output', 'qa-fixtures', 'state.json'),
  managerOptions: { resolveCommand: () => null },
  discover: async () => ({ sessions: [recent, old], processes: [], warnings: [], scope: { historyDays: 30, maxSessions: 60 } }),
  transcriptReader: async (id, { before } = {}) => ({ session: id.startsWith('claude') ? old : recent, messages: before ? [{ id: 'qa-previous', role: 'user', text: 'Synthetic QA: earlier message.', timestamp: old.lastActive }] : [{ id: 'qa-user', role: 'user', text: 'Synthetic QA: review the connector.', timestamp: recent.lastActive }, { id: 'qa-assistant', role: 'assistant', text: 'Synthetic QA: this is a fixture transcript, not a model response.', timestamp: recent.lastActive }], hasMore: !before, nextCursor: before ? null : '1', truncated: false, warnings: [] }),
});
app.server.listen(4321, '127.0.0.1', () => console.log(`Isolated browser fixtures at http://127.0.0.1:4321 (PID ${process.pid})`));
process.on('SIGINT', () => app.close());
process.on('SIGTERM', () => app.close());
