import React, { useEffect, useRef, useState } from 'react';
import './themes.css';
const modes = ['dark', 'light', 'system'];
export function useThemePreference() {
  const [mode, setMode] = useState(() => { try { const stored = localStorage.getItem('connect-theme'); return modes.includes(stored) ? stored : 'dark'; } catch { return 'dark'; } });
  useEffect(() => { const media = matchMedia('(prefers-color-scheme: light)'); const apply = () => { document.documentElement.dataset.theme = mode === 'system' ? media.matches ? 'light' : 'dark' : mode; }; apply(); try { localStorage.setItem('connect-theme', mode); } catch {} window.dispatchEvent(new CustomEvent('connect-theme-change',{detail:mode})); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply); }, [mode]);
  useEffect(()=>{const sync=event=>{if(modes.includes(event.detail))setMode(event.detail);};window.addEventListener('connect-theme-change',sync);return()=>window.removeEventListener('connect-theme-change',sync);},[]);
  return [mode,setMode];
}
export default function ThemeControl() {
  const [mode,setMode]=useThemePreference();
  const [open, setOpen] = useState(false); const root = useRef(null);
  useEffect(() => { if (!open) return; const close = event => { if (!root.current?.contains(event.target)) setOpen(false); }; document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close); }, [open]);
  return <div className="theme-control" ref={root} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}><button type="button" className="theme-control-trigger" aria-label={`Appearance: ${mode}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg><span>Appearance</span></button>{open && <div className="theme-control-menu" role="menu" aria-label="Color theme">{modes.map(value => <button key={value} type="button" role="menuitemradio" aria-checked={mode === value} onClick={() => { setMode(value); setOpen(false); }}><span>{value[0].toUpperCase() + value.slice(1)}</span><span aria-hidden="true">{mode === value ? '✓' : ''}</span></button>)}</div>}</div>;
}
