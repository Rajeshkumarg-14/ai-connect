// Original Connect UI primitives. Copyright (c) 2026 Connect contributors. MIT.
// Implemented independently using React and standard browser APIs.
import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './primitives.css';

function Glyph({ name, size = 18 }) {
  const paths = {
    close: 'M6 6l12 12M18 6 6 18', check: 'm5 12 4 4L19 6',
    send: 'M12 20V4m-6 6 6-6 6 6', attach: 'm9 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9',
    bell: 'M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3V9Zm4 12h4', stop: 'M6 6h12v12H6Z',
    undo: 'M4 10h10a6 6 0 0 1 0 12M4 10l5-5M4 10l5 5', info: 'M12 10v7M12 6h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.info}/></svg>;
}

const TooltipContext = createContext(null);
export function TooltipGroup({ children, delay = 500, warmWindow = 450 }) {
  const recent = useRef(0);
  return <TooltipContext.Provider value={{ recent, delay, warmWindow }}>{children}</TooltipContext.Provider>;
}
export function Tooltip({ children, content, shortcut, side = 'top', delay, disabled = false, className = '', surfaceColor = '#304463', inkColor = '#e5efff' }) {
  const group = useContext(TooltipContext), anchor = useRef(null), timer = useRef(null), id = useId();
  const [position, setPosition] = useState(null);
  const cancel = () => { clearTimeout(timer.current); timer.current = null; setPosition(null); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (!position) return; const close = () => setPosition(null); window.addEventListener('resize', close); window.addEventListener('scroll', close, true); return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); }; }, [position]);
  function reveal() {
    if (disabled || !content || !anchor.current) return;
    clearTimeout(timer.current);
    const waiting = group && Date.now() - group.recent.current < group.warmWindow ? 80 : delay ?? group?.delay ?? 500;
    timer.current = setTimeout(() => {
      const box = anchor.current?.getBoundingClientRect(); if (!box) return;
      const below = side === 'bottom' || box.top < 50;
      const estimatedWidth = Math.min(290, Math.max(90, typeof content === 'string' ? content.length * 6 + 22 : 200));
      setPosition({ left: Math.max(estimatedWidth / 2 + 12, Math.min(innerWidth - estimatedWidth / 2 - 12, box.left + box.width / 2)), top: below ? box.bottom + 9 : box.top - 9, below });
      if (group) group.recent.current = Date.now();
    }, waiting);
  }
  const host = anchor.current?.closest('dialog') || document.body;
  return <span ref={anchor} className={`tooltip-anchor ${className}`} onPointerEnter={reveal} onPointerLeave={cancel} onFocus={reveal} onBlur={cancel} onPointerDown={cancel} onKeyDown={event => { if (event.key === 'Escape') cancel(); }}>
    {React.isValidElement(children) ? React.cloneElement(children, { 'aria-describedby': position ? id : children.props['aria-describedby'] }) : children}
    {position && createPortal(<span id={id} role="tooltip" className={`connect-tooltip ${position.below ? 'below' : ''}`} style={{ left: position.left, top: position.top, background: surfaceColor, color: inkColor }}>{content}{shortcut && <kbd>{shortcut}</kbd>}</span>, host)}
  </span>;
}

export function AnimatedCheck({ checked, defaultChecked = false, onChange, label, ariaLabel, disabled = false, className = '', boxSize = 18, fontSize = 12, fillColor = '#b4c7ff', checkColor = '#15233e', color = '#cbdcf8', boxRadius = 4 }) {
  const [local, setLocal] = useState(defaultChecked), selected = checked ?? local;
  return <button type="button" role="checkbox" aria-checked={selected} aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)} disabled={disabled} className={`animated-check ${selected ? 'is-checked' : ''} ${className}`} style={{ fontSize, color, '--check-fill': fillColor, '--check-ink': checkColor }} onClick={() => { setLocal(!selected); onChange?.(!selected); }}>
    <span className="animated-check-box" style={{ width: boxSize, height: boxSize, borderRadius: boxRadius }}><svg width={Math.max(12, boxSize - 3)} height={Math.max(12, boxSize - 3)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.7" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></span>{label && <span className="animated-check-label">{label}</span>}
  </button>;
}

export function SegmentedTabs({ items, value, defaultValue, onChange, className = '', disabled = false, trackColor = '#14213a', thumbColor = '#344b76', textColor = '#aec3e5', activeTextColor = '#edf3ff', 'aria-label': label = 'Choose a view' }) {
  const normalized = items.map(item => typeof item === 'string' ? { value: item, label: item } : item);
  const [local, setLocal] = useState(defaultValue ?? normalized[0]?.value), buttons = useRef([]);
  const selected = value ?? local, active = Math.max(0, normalized.findIndex(item => item.value === selected));
  function choose(index, focus = false) { const item = normalized[index]; if (!item || disabled) return; setLocal(item.value); onChange?.(item.value, index); if (focus) buttons.current[index]?.focus(); }
  return <div role="tablist" aria-label={label} className={`segmented-tabs ${className}`} style={{ background: trackColor, '--segment-surface': thumbColor, '--segment-text': textColor, '--segment-active': activeTextColor }}>
    {normalized.map((item, index) => <Tooltip key={item.value} content={typeof item.label === 'string' ? item.label : undefined}><button ref={element => { buttons.current[index] = element; }} type="button" role="tab" aria-selected={index === active} tabIndex={index === active ? 0 : -1} disabled={disabled} className={`segment-button ${index === active ? 'selected' : ''}`} onClick={() => choose(index)} onKeyDown={event => { let next; if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % normalized.length; if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + normalized.length - 1) % normalized.length; if (event.key === 'Home') next = 0; if (event.key === 'End') next = normalized.length - 1; if (next !== undefined) { event.preventDefault(); choose(next, true); } }}>{item.icon}{item.label}</button></Tooltip>)}
  </div>;
}

export function NotificationToggle({ pressed, defaultPressed = false, onChange, disabled, label, offLabel = 'Muted', onLabel = 'Notify', className = '', background = '#263b59', onBackground = '#425e96' }) {
  const [local, setLocal] = useState(defaultPressed), selected = pressed ?? local;
  return <button type="button" className={`notification-toggle ${selected ? 'enabled' : ''} ${className}`} disabled={disabled} aria-pressed={selected} aria-label={label || (selected ? 'Mute notifications' : 'Enable notifications')} style={{ background: selected ? onBackground : background }} onClick={() => { setLocal(!selected); onChange?.(!selected); }}><Glyph name="bell" size={16}/><span>{selected ? onLabel : offLabel}</span><span className="notification-toggle-indicator"/></button>;
}

export function ActivityLoader({ label = 'Loading', status = 'loading', doneLabel = 'Done', errorLabel = 'Failed', color = '#b5c9ff', cellSize = 5, className = '' }) {
  const waiting = !['done', 'error'].includes(status);
  return <span className={`activity-loader ${waiting ? 'waiting' : ''} ${className}`} role="status" style={{ color }}><span className="activity-cells" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} style={{ width: cellSize, height: cellSize, animationDelay: `${index * 85}ms` }}/>)}</span><span>{status === 'done' ? doneLabel : status === 'error' ? errorLabel : label}</span></span>;
}
export function ProgressLine({ label = 'Working', doneLabel = 'Complete', working = true, steps = [], color = '#becff0', showTimer = false, className = '' }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => { if (!working || !showTimer) return; const start = Date.now(); const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000); return () => clearInterval(interval); }, [working, showTimer]);
  return <span className={`progress-line ${working ? 'working' : ''} ${className}`} style={{ color }} role="status"><span className="progress-dot"/><span>{working ? label : doneLabel}</span>{showTimer && <time>{elapsed}s</time>}{working && steps.length > 0 && <span className="progress-detail">{steps[steps.length - 1]}</span>}</span>;
}

export function UndoAction({ label = 'Archive', undoLabel = 'Undo', doneLabel = 'Done', undoWindow = 5000, disabled = false, onCommit, onUndo, onPhaseChange, className = '', background = '#354e78', color = '#edf3ff', fuseColor = '#aabfff' }) {
  const [phase, setPhase] = useState('idle'), [remaining, setRemaining] = useState(0), timer = useRef(null), ticker = useRef(null);
  const stop = () => { clearTimeout(timer.current); clearInterval(ticker.current); };
  useEffect(() => () => stop(), []);
  useEffect(() => { onPhaseChange?.(phase); }, [phase]);
  function arm() {
    if (phase === 'armed') { stop(); setPhase('idle'); onUndo?.(); return; }
    if (phase !== 'idle' || disabled) return;
    setPhase('armed'); setRemaining(Math.ceil(undoWindow / 1000)); const end = Date.now() + undoWindow;
    ticker.current = setInterval(() => setRemaining(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 100);
    timer.current = setTimeout(async () => { clearInterval(ticker.current); setPhase('committing'); try { const result = await onCommit?.('fuseEnd'); setPhase(result === false ? 'idle' : 'done'); } catch { setPhase('idle'); } }, undoWindow);
  }
  return <button type="button" className={`undo-action ${phase} ${className}`} disabled={disabled || phase === 'committing' || phase === 'done'} style={{ background, color, '--undo-color': fuseColor, '--undo-duration': `${undoWindow}ms` }} onClick={arm}><span>{phase === 'armed' ? `${undoLabel} · ${remaining}s` : phase === 'committing' ? 'Applying...' : phase === 'done' ? doneLabel : label}</span>{phase === 'armed' && <span className="undo-progress" aria-hidden="true"/>}</button>;
}

export function Toast({ open = true, title = 'Connect', description, onClose, actionLabel, onAction, duration = 5000, inline = false, closeButton = true, background = '#243751', color = '#e1edff', width = 390, className = '' }) {
  const [leaving, setLeaving] = useState(false), [drag, setDrag] = useState(0), [paused, setPaused] = useState(false), start = useRef(null), closed = useRef(false), timer = useRef(null);
  const close = reason => { if (closed.current) return; closed.current = true; setLeaving(true); timer.current = setTimeout(() => onClose?.(reason), 170); };
  useEffect(() => { if (!open || duration <= 0 || paused || leaving) return; const timeout = setTimeout(() => close('timeout'), duration); return () => clearTimeout(timeout); }, [open, duration, paused, leaving]);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!open) return null;
  return <section role="status" aria-live="polite" className={`connect-toast ${inline ? 'inline' : 'floating'} ${leaving ? 'leaving' : ''} ${className}`} style={{ background, color, width, '--toast-drag': `${drag}px` }} onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} onPointerDown={event => { if (event.target.closest('button')) return; start.current = event.clientX; event.currentTarget.setPointerCapture?.(event.pointerId); }} onPointerMove={event => { if (start.current !== null) setDrag(event.clientX - start.current); }} onPointerUp={() => { if (Math.abs(drag) > 80) close('swipe'); else setDrag(0); start.current = null; }} onPointerCancel={() => { start.current = null; setDrag(0); }}>
    <div className="connect-toast-content"><strong>{title}</strong>{description && <p>{description}</p>}{actionLabel && <button type="button" className="connect-toast-action" onClick={onAction}>{actionLabel}</button>}</div>{closeButton && <button type="button" className="connect-toast-close" onClick={() => close('dismiss')} aria-label="Dismiss notification"><Glyph name="close" size={16}/></button>}
  </section>;
}

export function ChatComposer({ value = '', onChange, attachments = [], onAttachmentsChange, onSend, onStop, onAttach, busy = false, placeholder = 'Message your agents', background = '#141f32', color = '#dfebff', className = '' }) {
  const [sending, setSending] = useState(false), lock = useRef(false), textarea = useRef(null);
  async function send() { if (lock.current || busy || (!value.trim() && !attachments.length)) return; lock.current = true; setSending(true); try { const result = await onSend?.(value.trim(), { attachments }); if (result !== false) { onChange?.(''); onAttachmentsChange?.([]); textarea.current?.focus(); } } finally { lock.current = false; setSending(false); } }
  return <div className={`chat-composer ${className}`} style={{ background, color }}><div className="chat-composer__field">{attachments.length > 0 && <div className="chat-composer__chips">{attachments.map((file, index) => <span className="chat-composer__chip" key={`${file}-${index}`}><span>{file}</span><Tooltip content={`Remove ${file}`}><button type="button" aria-label={`Remove ${file}`} disabled={busy || sending} onClick={() => onAttachmentsChange?.(attachments.filter((_, item) => item !== index))}><Glyph name="close" size={13}/></button></Tooltip></span>)}</div>}<textarea ref={textarea} className="chat-composer__input" aria-label="Message the room" value={value} onChange={event => onChange?.(event.target.value)} placeholder={placeholder} rows={3} data-gramm="false" data-enable-grammarly="false" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }}/><div className="chat-composer__toolbar"><Tooltip content="Attach files: images, PDF, text, or source"><button type="button" className="chat-composer__attach" aria-label="Attach files" disabled={busy || sending} onClick={() => onAttach?.()}><Glyph name="attach" size={17}/><span>Attach files</span></button></Tooltip><Tooltip content={busy ? 'Stop the current room turn' : 'Send message'}><button type="button" className="chat-composer__send" aria-label={busy ? 'Stop' : 'Send'} disabled={!busy && (sending || (!value.trim() && !attachments.length))} onClick={() => busy ? onStop?.() : send()}><Glyph name={busy ? 'stop' : 'send'} size={17}/><span>{busy ? 'Stop' : sending ? 'Sending...' : 'Send'}</span></button></Tooltip></div></div></div>;
}

export function HoverSurface({ children, className = '', style = {}, spotlightColor = '#a6bfff' }) {
  const ref = useRef(null);
  return <div ref={ref} className={`hover-surface ${className}`} style={{ ...style, '--surface-highlight': spotlightColor }} onPointerMove={event => { const box = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty('--surface-x', `${event.clientX - box.left}px`); event.currentTarget.style.setProperty('--surface-y', `${event.clientY - box.top}px`); }}>{children}</div>;
}
export function AccentAction({ children, className = '', backgroundColor = '#b6c6ff', textColor = '#17213b', radius = 7, onClick, disabled = false }) {
  return <button type="button" className={`accent-action ${className}`} style={{ background: backgroundColor, color: textColor, borderRadius: radius }} onClick={onClick} disabled={disabled}>{children}</button>;
}
