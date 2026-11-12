import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, statSync, mkdirSync, openSync, writeFileSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, dirname, extname, sep, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Store, AppError, required } from './lib/store.mjs';
import { AgentManager } from './lib/agents.mjs';
import { diagnose, sanitizeDiagnostic } from './lib/diagnostics.mjs';
import { NotificationCenter, NativeSessionNotifications, patchNotificationSettings } from './lib/notifications.mjs';
import { Uploads } from './lib/uploads.mjs';
import { legalStatus, acceptLegal } from './lib/legal.mjs';
import { discoverSessions, getSessionContext, getSessionTranscript } from './lib/discovery.mjs';

const root = dirname(fileURLToPath(import.meta.url));
function equal(a, b) { return typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
async function body(req, maximumBytes = 128 * 1024) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError('Use application/json.', 415);
  let text = '';
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > maximumBytes) throw new AppError(`Request exceeds ${Math.round(maximumBytes / 1024)} KiB.`, 413); }
  try { const value = JSON.parse(text); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value; }
  catch { throw new AppError('Request must be a JSON object.'); }
}
export function waitForMessages(store, agent, args, { signal, isStopped = () => false } = {}) {
  const timeoutMs = Math.max(0, Math.min(20000, Number(args.timeoutMs ?? 20000) || 0));
  const read = () => {
    const all = store.data.messages.filter(m => m.roomId === agent.roomId);
    const index = args.after ? all.findIndex(m => m.id === args.after) : all.length - 1;
    const source = agent.role === 'bridge' ? store.data.agents.find(a => a.roomId === agent.roomId && a.external && a.sourceSessionId === agent.targetSessionId) : null;
    return { cursor: all.at(-1)?.id ?? '', messages: all.slice(Math.max(0, index + 1)).filter(m => m.from !== agent.id && m.from !== 'system' && (m.from !== 'human' || m.dispatch?.requested === true) && (m.to === 'all' || m.to === agent.id || m.to === source?.id)).slice(-20) };
  };
  return new Promise(resolve => {
    let interval; let timer;
    const finish = stopped => { clearInterval(interval); clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve({ ...read(), stopped }); };
    const abort = () => finish(true);
    const initial = read();
    if (signal?.aborted || isStopped()) return finish(true);
    if (initial.messages.length || !timeoutMs) return finish(false);
    signal?.addEventListener('abort', abort, { once: true });
    interval = setInterval(() => { if (isStopped()) finish(true); else if (read().messages.length) finish(false); }, 200);
    timer = setTimeout(() => finish(false), timeoutMs);
  });
}
export function createApp({ dataFile = join(root, '.connect', 'state.json'), requireLegalAcceptance = true, managerOptions = {}, notificationOptions = {}, discover = discoverSessions, contextReader = getSessionContext, transcriptReader = getSessionTranscript } = {}) {
  const startedAt = new Date().toISOString();
  const token = randomBytes(32).toString('hex'); const clients = new Set();
  const emit = (event, data) => { const packet = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const res of clients) if (!res.write(packet)) { clients.delete(res); res.end(); } };
  const store = new Store(dataFile, data => emit('state', data));
  const uploads = new Uploads(store);
  const notifications = new NotificationCenter(store, { ...notificationOptions, emit });
  const sessionNotifications = new NativeSessionNotifications(store, notifications, async (...args) => { if (legalStatus(store.data, requireLegalAcceptance).required) throw new AppError('Review and accept the current legal notices before reading native sessions.', 428); return transcriptReader(...args); }, { intervalMs: notificationOptions.nativeIntervalMs ?? 15000 });
  let origin;
  const manager = new AgentManager(store, { ...managerOptions, emit, notify: (agent, kind, message) => notifications.agent(agent, kind, message), brokerURL: managerOptions.brokerURL ?? 'http://127.0.0.1:4318' });
  const admin = req => equal(req.headers['x-connect-token'], token) || (req.headers.cookie ?? '').split(';').some(c => equal(c.trim(), `connect_session=${token}`));
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const address = server.address();
      const port = typeof address === 'object' ? address.port : 4318;
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
      if (!allowedHosts.includes(req.headers.host)) throw new AppError('Unrecognized local host.', 403);
      origin = `http://${req.headers.host}`;
      if (req.headers.origin && req.headers.origin !== origin) throw new AppError('Cross-origin requests are blocked.', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new AppError('Cross-site requests are blocked.', 403);
      const url = new URL(req.url, origin); const path = url.pathname; const method = req.method;
      if (path === '/api/bootstrap' && method === 'GET') {
        res.setHeader('Set-Cookie', `connect_session=${token}; HttpOnly; SameSite=Strict; Path=/`);
        return json(res, 200, { token, state: store.snapshot(), legal: legalStatus(store.data, requireLegalAcceptance), capabilities: manager.capabilities(), runtime: { startedAt, scope: 'local', historicalErrorsPreserved: true } });
      }
      if (path === '/api/agent-tool' && method === 'POST') {
        const capability = req.headers.authorization?.replace(/^Bearer /, '');
        const agent = store.data.agents.find(a => equal(a.capabilityToken, capability));
        if (!agent || agent.external) throw new AppError('Invalid agent capability.', 401);
        if (legalStatus(store.data, requireLegalAcceptance).required) throw new AppError('Review and accept the current legal notices before agent activity.', 428);
        const input = await body(req); const args = input.arguments ?? {};
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new AppError('Tool arguments must be an object.');
        let result;
        switch (input.name) {
          case 'room_context': result = store.context(agent); break;
          case 'list_tasks': result = store.data.tasks.filter(t => t.roomId === agent.roomId); break;
          case 'request_assistance': result = { assistance: manager.requestAssistance(agent, args), status: 'waiting_for_human', instruction: 'Your question is saved for the human. End this turn now. Do not continue until an explicit human response is sent.' }; break;
          case 'wait_for_messages': {
            const controller = new AbortController(); const abort = () => controller.abort(); res.once('close', abort);
            result = await waitForMessages(store, agent, args, { signal: controller.signal, isStopped: () => agent.role === 'bridge' && (!manager.running.has(agent.id) || manager.running.get(agent.id)?.cancelling || !store.room(agent.roomId).autoReply) });
            res.removeListener('close', abort); if (res.destroyed) return; break;
          }
          case 'bridge_status': {
            if (agent.role !== 'bridge') throw new AppError('Only a relay can update bridge status.', 403);
            if (!['connected', 'error', 'stopped'].includes(args.status)) throw new AppError('Invalid bridge status.');
            agent.bridgeStatus = args.status; agent.bridgeEvidence = sanitizeDiagnostic(required(args.evidence, 'Native verification evidence', 2000), [agent.capabilityToken]); agent.lastActive = new Date().toISOString();
            if (args.status === 'error') { agent.failedAt = agent.lastActive; agent.errorInfo = { ...diagnose('', { kind: 'bridge', provider: agent.provider }), failedAt: agent.failedAt }; agent.error = agent.errorInfo.message; }
            else if (args.status === 'connected') { delete agent.errorInfo; agent.error = ''; }
            store.save(); result = { status: agent.bridgeStatus, evidence: agent.bridgeEvidence, verification: 'relay-reported native tool outcome' }; break;
          }
          case 'send_message': result = store.addMessage({ roomId: agent.roomId, from: agent.id, to: args.to, text: args.text, attachments: args.attachments }); manager.deliver(result); break;
          case 'claim_task': result = store.updateTask(args.taskId, { owner: agent.id, status: 'in_progress' }, agent); break;
          case 'update_task': result = store.updateTask(args.taskId, { status: args.status }, agent); break;
          case 'report_finding': result = store.addFinding({ ...args, roomId: agent.roomId }, agent); break;
          default: throw new AppError('Unknown agent tool.');
        }
        return json(res, 200, result);
      }
      if (path.startsWith('/api/')) {
        if (!admin(req)) throw new AppError('Session expired. Refresh the page.', 401);
        if (path === '/api/legal' && method === 'GET') return json(res, 200, legalStatus(store.data, requireLegalAcceptance));
        if (path === '/api/legal/accept' && method === 'POST') return json(res, 200, acceptLegal(store, await body(req)));
        if (path === '/api/legal/revoke' && method === 'POST') {
          for (const room of store.data.rooms) manager.stopRoom(room.id);
          delete store.data.legalAcceptance; store.save(); return json(res, 200, legalStatus(store.data, requireLegalAcceptance));
        }
        const readOnlyBeforeAcceptance = ['/api/state', '/api/events', '/api/runtime/status'];
        if (legalStatus(store.data, requireLegalAcceptance).required && !(method === 'GET' && readOnlyBeforeAcceptance.includes(path))) throw new AppError('Review and accept the current Terms and Privacy notice before using this feature.', 428);
        if (path === '/api/state' && method === 'GET') return json(res, 200, store.snapshot());
        if (path === '/api/uploads' && method === 'POST') return json(res, 201, uploads.save(await body(req, 12 * 1024 * 1024)));
        const download = path.match(/^\/api\/uploads\/([a-f0-9-]{36})$/i);
        if (download && method === 'GET') {
          const { upload, bytes } = uploads.get(download[1]);
          res.writeHead(200, { 'Content-Type': upload.type, 'Content-Disposition': `attachment; filename="attachment${extname(upload.name).replace(/[^.a-zA-Z0-9]/g, '')}"; filename*=UTF-8''${encodeURIComponent(upload.name).replace(/'/g, '%27')}`, 'Content-Length': bytes.length, 'Cache-Control': 'no-store' });
          return res.end(bytes);
        }
        if (path === '/api/runtime/status' && method === 'GET') return json(res, 200, { startedAt, scope: 'local', capabilities: manager.capabilities(), historicalErrorsPreserved: true, notice: 'Saved agent errors describe previous attempts. A CLI being available does not prove authentication, provider quota, or permission to launch it from this server. Retry is always explicit.' });
        if (path === '/api/settings' && method === 'GET') return json(res, 200, store.data.settings);
        if (path === '/api/settings' && method === 'PATCH') { const input = await body(req); const settings = patchNotificationSettings(store.data, input.notifications ?? input); store.save(); return json(res, 200, settings); }
        if (path === '/api/session-notifications' && method === 'PATCH') {
          const input = await body(req); const sessionId = required(input.sessionId, 'Session ID', 160);
          if (!/^[a-zA-Z0-9:_-]{6,160}$/.test(sessionId) || typeof input.enabled !== 'boolean') throw new AppError('Choose a valid session ID and notification setting.');
          if (!Object.hasOwn(store.data.settings.notifications.perSession, sessionId) && Object.keys(store.data.settings.notifications.perSession).length >= 500) throw new AppError('Too many individual session notification settings.');
          if (input.enabled && /^(claude|codex):/.test(sessionId) && store.data.settings.notifications.perSession[sessionId] !== true && Object.entries(store.data.settings.notifications.perSession).filter(([key, value]) => /^(claude|codex):/.test(key) && value === true).length >= 20) throw new AppError('You can monitor up to 20 native sessions at once. Turn off another session notification first.');
          let warning;
          if (input.enabled && /^(claude|codex):/.test(sessionId)) {
            try { await sessionNotifications.baseline(sessionId); } catch { warning = 'Notifications are enabled, but this session could not be read yet. Connect will retry while the app server is running.'; }
          }
          store.data.settings.notifications.perSession[sessionId] = input.enabled; store.save();
          return json(res, 200, { sessionId, enabled: input.enabled, ...(warning ? { warning } : {}) });
        }
        if (path === '/api/notifications/custom' && method === 'POST') return json(res, 201, notifications.custom(await body(req)));
        const customNotification = path.match(/^\/api\/notifications\/custom\/([^/]+)$/);
        if (customNotification && method === 'PATCH') return json(res, 200, notifications.custom(await body(req), customNotification[1]));
        if (customNotification && method === 'DELETE') {
          if (!store.data.customNotifications.some(item => item.id === customNotification[1])) throw new AppError('Custom notification was not found.', 404);
          store.data.customNotifications = store.data.customNotifications.filter(item => item.id !== customNotification[1]); store.save(); return json(res, 200, { deleted: true });
        }
        const readNotification = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
        if (readNotification && method === 'POST') {
          const item = store.data.notifications.find(item => item.id === readNotification[1]);
          if (!item) throw new AppError('Notification was not found.', 404);
          const input = await body(req); if (input.read !== undefined && typeof input.read !== 'boolean') throw new AppError('read must be true or false.');
          item.read = input.read ?? true; store.save(); return json(res, 200, item);
        }
        if (path === '/api/notifications/test' && method === 'POST') return json(res, 200, { notification: notifications.notify({ kind: 'test', title: 'Connect notifications are ready', message: 'This is a test notification. Browser alerts and sound follow your settings.' }), notice: 'Quiet hours and global notification preferences also apply to tests.' });
        if (path === '/api/events' && method === 'GET') {
          if (clients.size >= 20) throw new AppError('Too many event connections.', 429);
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
          res.write(`event: state\ndata: ${JSON.stringify(store.snapshot())}\n\n`); clients.add(res);
          const interval = setInterval(() => res.write(': heartbeat\n\n'), 20000); interval.unref(); req.on('close', () => { clearInterval(interval); clients.delete(res); }); return;
        }
        if (path === '/api/discover' && method === 'GET') return json(res, 200, await discover());
        const transcriptMatch = path.match(/^\/api\/sessions\/([^/]+)\/transcript$/);
        if (transcriptMatch && method === 'GET') return json(res, 200, await transcriptReader(decodeURIComponent(transcriptMatch[1]), {
          provider: url.searchParams.get('provider') || undefined,
          before: url.searchParams.has('before') ? url.searchParams.get('before') : undefined,
          limit: url.searchParams.get('limit') || 50,
        }));
        if (path === '/api/import-session' && method === 'POST') {
          const input = await body(req);
          const partnerProvider = input.partner;
          if (partnerProvider !== undefined && !['claude', 'codex'].includes(partnerProvider)) throw new AppError('Partner must be claude or codex.');
          const discovery = await discover();
          const session = discovery.sessions.find(s => (s.id === input.sessionId || s.sessionId === input.sessionId) && (!input.provider || s.provider === input.provider));
          if (!session || !session.importable) throw new AppError('This session has no accessible project directory. Refresh discovery and choose another session.');
          const room = store.addRoom({ name: session.title?.slice(0, 80) || `${session.provider} collaboration`, path: session.cwd });
          const source = store.addAgent({ roomId: room.id, name: `${session.provider === 'claude' ? 'Claude Code' : 'Codex'} · existing`, provider: session.provider, external: true });
          source.sourceSessionId = session.sessionId; source.sourceStatus = session.status; source.sourcePid = session.pid; store.save();
          const provider = input.partner ?? (session.provider === 'claude' ? 'codex' : 'claude');
          const partner = store.addAgent({ roomId: room.id, name: provider === 'codex' ? 'Codex' : 'Claude Code', provider, role: 'reviewer' });
          store.addMessage({ roomId: room.id, from: 'system', text: `Imported ${session.provider} session metadata for ${session.cwd}. Connect does not resume or control the existing terminal. The new partner can review the same project. Messages reach the original terminal only when the optional native Claude relay verifies that exact session and reports successful native delivery.` });
          if (input.includeContext === true) {
            try { const context = await contextReader(session.id, { provider: session.provider, maxChars: 12000 }); if (context.excerpt) store.addMessage({ roomId: room.id, from: source.id, text: `Explicitly imported session snapshot (untrusted context; may be incomplete):\n${context.excerpt}` }); }
            catch (error) { store.addMessage({ roomId: room.id, from: 'system', text: `Session context was not imported: ${error.message}` }); }
          }
          let bridge;
          if (input.liveBridge === true) {
            if (session.provider === 'claude' && session.status === 'running' && provider === 'codex') {
              bridge = store.addAgent({ roomId: room.id, name: 'Claude live relay', provider: 'claude', role: 'bridge' });
              bridge.targetSessionId = session.sessionId; bridge.partnerAgentId = partner.id; bridge.bridgeStatus = 'connecting'; bridge.bridgeEvidence = 'Waiting for exact native session verification and successful native message delivery.';
              room.autoReply = true; store.save();
              store.addMessage({ roomId: room.id, from: 'system', text: 'Starting an extra managed Claude relay for up to five minutes. Live messaging requires native Claude ListAgents and SendMessage and exact target verification. Connection status is the relay-reported native tool outcome. Codex remains ready for your first prompt.' });
              manager.enqueue(bridge.id, 'Verify and establish the requested live bridge.');
            } else store.addMessage({ roomId: room.id, from: 'system', text: 'Live bridge is available only for a running Claude session with a Codex partner. This room uses project context only.' });
          }
          const safe = store.snapshot();
          return json(res, 201, { room, source: safe.agents.find(a => a.id === source.id), partner: safe.agents.find(a => a.id === partner.id), ...(bridge ? { bridge: safe.agents.find(a => a.id === bridge.id) } : {}) });
        }
        if (path === '/api/rooms' && method === 'POST') return json(res, 201, store.addRoom(await body(req)));
        if (path === '/api/agents' && method === 'POST') { const agent = store.addAgent(await body(req)); const { capabilityToken, ...safe } = agent; return json(res, 201, safe); }
        if (path === '/api/messages' && method === 'POST') { const input = await body(req); const message = store.addMessage({ roomId: input.roomId, from: 'human', to: input.to, text: input.text, attachments: input.attachments }); manager.deliver(message, { run: input.run === true }); return json(res, 201, message); }
        const messageRun = path.match(/^\/api\/messages\/([^/]+)\/run$/);
        if (messageRun && method === 'POST') {
          const message = store.get('messages', messageRun[1]);
          if (message.from !== 'human') throw new AppError('Only your own saved messages can be run again.', 403);
          const dispatch = manager.deliver(message, { run: true });
          return json(res, 200, { messageId: message.id, dispatch });
        }
        if (path === '/api/tasks' && method === 'POST') return json(res, 201, store.addTask(await body(req)));
        if (path === '/api/findings' && method === 'POST') return json(res, 201, store.addFinding(await body(req)));
        const approvePlan = path.match(/^\/api\/rooms\/([^/]+)\/plan$/);
        if (approvePlan && method === 'POST') return json(res, 200, store.approvePlan(approvePlan[1], await body(req)));
        const assistanceResponse = path.match(/^\/api\/assistance\/([^/]+)\/respond$/);
        if (assistanceResponse && method === 'POST') {
          const item = store.get('assistance', assistanceResponse[1]);
          if (item.status !== 'open') throw new AppError('This assistance request has already been answered.', 409);
          const input = await body(req); const to = input.to ?? item.agentId;
          if (!to || store.get('agents', to).roomId !== item.roomId) throw new AppError('Choose an agent from this room to receive your answer.');
          const message = store.addMessage({ roomId: item.roomId, from: 'human', to, text: `Human response to: ${item.question}\n\n${required(input.text, 'Your response', 16000)}` });
          item.status = 'resolved'; item.resolvedAt = new Date().toISOString(); item.responseMessageId = message.id;
          const target = store.get('agents', to); target.awaitingAssistance = false; store.save();
          const dispatch = manager.deliver(message, { run: input.run !== false });
          return json(res, 200, { assistance: item, message, dispatch });
        }
        const archiveRoom = path.match(/^\/api\/rooms\/([^/]+)\/archive$/);
        if (archiveRoom && method === 'POST') {
          const input = await body(req); if (typeof input.archived !== 'boolean') throw new AppError('archived must be true or false.');
          if (input.archived) manager.stopRoom(archiveRoom[1]);
          return json(res, 200, store.archiveRoom(archiveRoom[1], input.archived));
        }
        const archiveSession = path.match(/^\/api\/sessions\/([^/]+)\/archive$/);
        if (archiveSession && method === 'POST') { const input = await body(req); return json(res, 200, store.archiveSession(decodeURIComponent(archiveSession[1]), input.archived)); }
        let match = path.match(/^\/api\/rooms\/([^/]+)$/);
        if (match && method === 'PATCH') return json(res, 200, store.updateRoom(match[1], await body(req)));
        if (match && method === 'DELETE') {
          const input = await body(req); const room = store.room(match[1]);
          if (input.confirmName !== room.name) throw new AppError('Type the exact room name to delete this Connect room.');
          manager.stopRoom(room.id); uploads.deleteRoom(room.id); return json(res, 200, store.deleteRoom(room.id, input.confirmName));
        }
        match = path.match(/^\/api\/rooms\/([^/]+)\/stop$/);
        if (match && method === 'POST') { manager.stopRoom(match[1]); return json(res, 200, { ok: true }); }
        match = path.match(/^\/api\/agents\/([^/]+)\/(run|stop|config)$/);
        if (match) {
          const agent = store.get('agents', match[1]);
          if (match[2] === 'run' && method === 'POST') { const input = await body(req); const dispatch = manager.enqueue(agent.id, input.prompt); return json(res, ['running', 'queued'].includes(dispatch.status) ? 202 : 200, { ok: ['running', 'queued'].includes(dispatch.status), dispatch, ...(dispatch.errorInfo ? { errorInfo: dispatch.errorInfo } : {}) }); }
          if (match[2] === 'stop' && method === 'POST') { manager.stop(agent.id); return json(res, 200, { ok: true }); }
          if (match[2] === 'config' && method === 'GET') return json(res, 200, { mcpServers: { connect: { command: process.execPath, args: [join(root, 'mcp.mjs')], env: { CONNECT_URL: manager.brokerURL, CONNECT_AGENT_TOKEN: agent.capabilityToken } } } });
        }
        match = path.match(/^\/api\/(tasks|findings)\/([^/]+)$/);
        if (match && method === 'PATCH') return json(res, 200, match[1] === 'tasks' ? store.updateTask(match[2], await body(req)) : store.updateFinding(match[2], await body(req)));
        throw new AppError('API route not found.', 404);
      }
      if (method !== 'GET' && method !== 'HEAD') throw new AppError('Method not allowed.', 405);
      const legalPage = path.startsWith('/legal/');
      const staticRoot = legalPage ? join(root, 'site') : existsSync(join(root, 'dist', 'index.html')) ? join(root, 'dist') : join(root, 'public');
      const decoded = decodeURIComponent(legalPage ? path.slice('/legal'.length) : path); let file = resolve(staticRoot, `.${decoded}`);
      if (legalPage && !extname(file) && existsSync(`${file}.html`)) file += '.html';
      if (file !== staticRoot && !file.startsWith(`${staticRoot}${sep}`)) throw new AppError('Path is outside the app.', 403);
      if (!existsSync(file) || !statSync(file).isFile()) { if (extname(path)) throw new AppError('File not found.', 404); file = join(staticRoot, 'index.html'); }
      if (!existsSync(file)) return json(res, 503, { error: 'The frontend has not been built yet. Run npm run build, then refresh.' });
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
      res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': ['.html', '.js', '.css'].includes(extname(file)) ? 'no-cache' : 'public, max-age=3600' });
      res.end(method === 'HEAD' ? undefined : readFileSync(file));
    } catch (error) { if (!res.headersSent) json(res, error.status ?? 500, { error: error.status ? error.message : 'An internal error occurred. Check the server terminal.' }); else res.end(); if (!error.status) console.error(error); }
  });
  server.on('listening', () => { const address = server.address(); manager.brokerURL = `http://127.0.0.1:${address.port}`; });
  server.on('close', () => { sessionNotifications.close(); notifications.close(); manager.close(); });
  return { server, store, manager, notifications, sessionNotifications, close: () => { sessionNotifications.close(); notifications.close(); manager.close(); for (const client of clients) client.end(); server.close(); } };
}

export function startServer({ port = Number(process.env.PORT ?? 4318), dataFile = join(root, '.connect', 'state.json'), runtimeDirectory = dirname(dataFile), handleSignals = true, onError = error => { console.error(error.message); process.exitCode = 1; }, ...options } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const runtime = resolve(runtimeDirectory); mkdirSync(runtime, { recursive: true });
  const lockFile = join(runtime, 'server.lock'); let lock;
  try { lock = openSync(lockFile, 'wx'); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(readFileSync(lockFile, 'utf8'));
    let running = false; if (Number.isInteger(pid) && pid > 0) { try { process.kill(pid, 0); running = true; } catch (e) { if (e.code === 'EPERM') running = true; } }
    if (running) throw new Error(`Connect is already running (PID ${pid}). Open http://127.0.0.1:${port}`);
    unlinkSync(lockFile); lock = openSync(lockFile, 'wx');
  }
  writeFileSync(lock, String(process.pid)); closeSync(lock);
  const release = () => { try { if (readFileSync(lockFile, 'utf8') === String(process.pid)) unlinkSync(lockFile); } catch {} };
  process.once('exit', release);
  let app;
  try { app = createApp({ ...options, dataFile }); } catch (error) { release(); process.removeListener('exit', release); throw error; }
  app.server.listen(port, '127.0.0.1', () => console.log(`Connect is ready at http://127.0.0.1:${port}\nLocal-only · CLI authentication stays with Claude Code and Codex.`));
  app.server.on('error', error => { release(); onError(error); });
  const stop = () => { app.close(); release(); process.removeListener('exit', release); process.removeListener('SIGINT', shutdown); process.removeListener('SIGTERM', shutdown); };
  const shutdown = () => { stop(); setTimeout(() => process.exit(), 1000).unref(); };
  if (handleSignals) { process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown); }
  return { ...app, stop, lockFile };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startServer();
