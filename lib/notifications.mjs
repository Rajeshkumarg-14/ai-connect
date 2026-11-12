import { randomUUID } from 'node:crypto';
import { AppError, required } from './store.mjs';
import { sanitizeDiagnostic } from './diagnostics.mjs';

export const notificationDefaults = () => ({ enabled: true, inApp: true, browser: false, sound: false, notifyOnReply: true, notifyOnError: true, quietHoursEnabled: false, quietStart: '22:00', quietEnd: '08:00', timezone: 'Asia/Kolkata', perSession: {} });
export function normalizeNotificationState(data) {
  data.settings ??= {};
  data.settings.notifications = { ...notificationDefaults(), ...(data.settings.notifications ?? {}), perSession: { ...(data.settings.notifications?.perSession ?? {}) } };
  data.notifications ??= []; data.customNotifications ??= []; data.hiddenSessions ??= {}; data.notificationCursors ??= {};
}
export function patchNotificationSettings(data, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Notification settings must be an object.');
  const next = { ...data.settings.notifications, perSession: { ...data.settings.notifications.perSession } };
  for (const key of ['enabled', 'inApp', 'browser', 'sound', 'notifyOnReply', 'notifyOnError', 'quietHoursEnabled']) if (input[key] !== undefined) {
    if (typeof input[key] !== 'boolean') throw new AppError(`${key} must be true or false.`);
    next[key] = input[key];
  }
  for (const key of ['quietStart', 'quietEnd']) if (input[key] !== undefined) {
    if (typeof input[key] !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input[key])) throw new AppError(`${key} must be a time in HH:MM format.`);
    next[key] = input[key];
  }
  if (input.timezone !== undefined) {
    try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }).format(); } catch { throw new AppError('Choose a valid timezone.'); }
    next.timezone = input.timezone;
  }
  data.settings.notifications = next; return data.settings;
}
export function isQuietTime(settings, now = new Date()) {
  if (!settings.quietHoursEnabled) return false;
  const values = new Intl.DateTimeFormat('en-GB', { timeZone: settings.timezone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(now);
  const current = `${values.find(p => p.type === 'hour').value}:${values.find(p => p.type === 'minute').value}`;
  const start = settings.quietStart; const end = settings.quietEnd;
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}
export class NotificationCenter {
  constructor(store, { emit = () => {}, now = () => new Date(), intervalMs = 1000 } = {}) {
    this.store = store; this.emit = emit; this.now = now; this.closed = false;
    normalizeNotificationState(store.data);
    if (intervalMs > 0) { this.interval = setInterval(() => this.tick(), intervalMs); this.interval.unref(); }
  }
  allowed(input) {
    const prefs = this.store.data.settings.notifications;
    if (!prefs.enabled || isQuietTime(prefs, this.now())) return false;
    if (input.kind === 'reply' && !prefs.notifyOnReply) return false;
    if (input.kind === 'error' && !prefs.notifyOnError) return false;
    const keys = [input.agentId, input.sessionId].filter(Boolean);
    if (keys.some(key => prefs.perSession[key] === false)) return false;
    if (input.roomId && this.store.data.rooms.find(r => r.id === input.roomId)?.archived) return false;
    if (input.sessionId && this.store.data.hiddenSessions[input.sessionId]) return false;
    return true;
  }
  notify(input) {
    if (this.closed || !this.allowed(input)) return null;
    const prefs = this.store.data.settings.notifications;
    const item = { id: randomUUID(), kind: input.kind ?? 'custom', ...(input.roomId ? { roomId: input.roomId } : {}), ...(input.agentId ? { agentId: input.agentId } : {}), ...(input.sessionId ? { sessionId: input.sessionId } : {}), title: sanitizeDiagnostic(input.title).slice(0, 160), message: sanitizeDiagnostic(input.message).slice(0, 600), createdAt: this.now().toISOString(), read: false, channels: { inApp: prefs.inApp, browser: prefs.browser, sound: prefs.sound } };
    if (prefs.inApp) { this.store.data.notifications.push(item); this.store.data.notifications = this.store.data.notifications.slice(-200); this.store.save(); }
    this.emit('notification', item); return item;
  }
  agent(agent, kind, message) {
    return this.notify({ kind, roomId: agent.roomId, agentId: agent.id, ...(agent.sourceSessionId ? { sessionId: `${agent.provider}:${agent.sourceSessionId}` } : {}), title: `${agent.name} ${kind === 'error' ? 'needs attention' : kind === 'assistance' ? 'needs your decision' : kind === 'handoff' ? 'continues the approved plan' : 'replied'}`, message });
  }
  custom(input, id = null) {
    if (this.store.data.customNotifications.length >= 100 && !id) throw new AppError('You can save up to 100 custom notifications. Delete an old notification first.');
    const existing = id ? this.store.data.customNotifications.find(item => item.id === id) : null;
    if (id && !existing) throw new AppError('Custom notification was not found.', 404);
    const next = { ...(existing ?? { id: randomUUID(), enabled: true, createdAt: this.now().toISOString(), firedAt: null }), ...input };
    next.id = existing?.id ?? randomUUID();
    next.title = required(next.title, 'Notification title', 160);
    next.message = required(next.message, 'Notification message', 1000);
    if (typeof next.enabled !== 'boolean') throw new AppError('enabled must be true or false.');
    if (typeof next.scheduledAt !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(next.scheduledAt) || !Number.isFinite(Date.parse(next.scheduledAt))) throw new AppError('Choose a valid notification date and time including its timezone.');
    next.scheduledAt = new Date(next.scheduledAt).toISOString();
    if (input.scheduledAt !== undefined && (!existing || next.scheduledAt !== existing.scheduledAt)) {
      if (Date.parse(next.scheduledAt) <= this.now().getTime()) throw new AppError('Choose a notification time in the future.');
      next.firedAt = null;
    }
    const safe = { id: next.id, title: next.title, message: next.message, scheduledAt: next.scheduledAt, enabled: next.enabled, createdAt: existing?.createdAt ?? next.createdAt, firedAt: next.firedAt ?? null };
    if (existing) Object.assign(existing, safe); else this.store.data.customNotifications.push(safe);
    this.store.save(); return safe;
  }
  tick() {
    if (this.closed) return;
    const due = this.store.data.customNotifications.filter(item => item.enabled && !item.firedAt && Date.parse(item.scheduledAt) <= this.now().getTime());
    // Quiet hours and disabled global notifications defer a reminder rather
    // than silently losing it. Persist firedAt before emitting for at-most-once.
    for (const item of due) {
      if (!this.allowed({ kind: 'custom' })) continue;
      item.firedAt = this.now().toISOString(); this.store.save();
      this.notify({ kind: 'custom', title: item.title, message: item.message });
    }
  }
  close() { this.closed = true; clearInterval(this.interval); }
}

export class NativeSessionNotifications {
  constructor(store, notifications, reader, { intervalMs = 15000, canRead = () => true } = {}) {
    this.store = store; this.notifications = notifications; this.reader = reader; this.canRead = canRead; this.busy = false; this.closed = false;
    if (intervalMs > 0) { this.interval = setInterval(() => { this.tick().catch(() => {}); }, intervalMs); this.interval.unref(); }
  }
  async baseline(sessionId) {
    if (!this.canRead()) return;
    if (!/^(claude|codex):[a-zA-Z0-9_-]{6,120}$/.test(sessionId)) return;
    const result = await this.reader(sessionId, { limit: 20 });
    this.store.data.notificationCursors[sessionId] = result.messages.at(-1)?.id ?? '';
    this.store.save();
  }
  async tick() {
    if (this.closed || this.busy || !this.store.data.settings.notifications.enabled || !this.canRead()) return;
    this.busy = true;
    try {
      const sessions = Object.entries(this.store.data.settings.notifications.perSession).filter(([id, enabled]) => enabled === true && /^(claude|codex):[a-zA-Z0-9_-]{6,120}$/.test(id) && !this.store.data.hiddenSessions[id]).slice(0, 20);
      for (const [sessionId] of sessions) {
        if (this.closed) return;
        let result;
        try { result = await this.reader(sessionId, { limit: 20 }); } catch { continue; }
        if (!Object.hasOwn(this.store.data.notificationCursors, sessionId)) { this.store.data.notificationCursors[sessionId] = result.messages.at(-1)?.id ?? ''; this.store.save(); continue; }
        const cursor = this.store.data.notificationCursors[sessionId];
        const index = cursor ? result.messages.findIndex(item => item.id === cursor) : -1;
        // An unseen old cursor can mean rotation or a bounded-history gap.
        // Rebaseline rather than notifying historical text as a fresh reply.
        const fresh = !cursor ? result.messages : index >= 0 ? result.messages.slice(index + 1) : [];
        this.store.data.notificationCursors[sessionId] = result.messages.at(-1)?.id ?? cursor; this.store.save();
        const reply = fresh.filter(item => item.role === 'assistant').at(-1);
        if (reply) this.notifications.notify({ kind: 'reply', sessionId, title: `${result.session?.title || result.session?.provider || 'Session'} replied`, message: reply.text.slice(0, 600) });
      }
    } finally { this.busy = false; }
  }
  close() { this.closed = true; clearInterval(this.interval); }
}
