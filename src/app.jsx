import { ChatComposer, ProgressLine, Toast, NotificationToggle, ActivityLoader, UndoAction, SegmentedTabs, AnimatedCheck, Tooltip, TooltipGroup, HoverSurface, AccentAction } from './ui/primitives.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ThemeControl, { useThemePreference } from './ui/ThemeControl.jsx';
import './ui/clean-workspace.css';
import StartupScreen from './ui/StartupScreen.jsx';

import { createRoot } from 'react-dom/client';


import AnimatedSelect from './ui/AnimatedSelect.jsx';
import NotificationsSettings from './ui/NotificationsSettings.jsx';
import LegalConsent from './ui/LegalConsent.jsx';
import PlanSettings from './ui/PlanSettings.jsx';
import AssistanceReply from './ui/AssistanceReply.jsx';

import AnimatedDateTimePicker, { AnimatedTimePicker, localDateTimeValue } from './ui/AnimatedDateTime.jsx';



const empty = { rooms: [], agents: [], messages: [], tasks: [], findings: [] };

const paths = {

  more: 'M5 12h.01M12 12h.01M19 12h.01', plus: 'M12 5v14M5 12h14', arrow: 'M5 12h14m-6-6 6 6-6 6', send: 'm21 3-7 18-4-7-7-4 18-7ZM10 14l5-5',

  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',

  scan: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M3 12h18',

  message: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8A8.5 8.5 0 0 1 12.5 20a8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',

  check: 'm5 12 4 4L19 6', task: 'm4 6 2 2 3-4M12 6h8M4 13h3M12 13h8M4 20h3M12 20h8',

  bug: 'M8 10h8v7a4 4 0 0 1-8 0v-7ZM9 10V7a3 3 0 0 1 6 0v3M12 10v11M4 13h4M16 13h4M4 19l4-2M16 17l4 2M4 6l4 4M16 10l4-4',

  bolt: 'm13 2-9 12h7l-1 8 10-12h-7l0-8Z', stop: 'M6 6h12v12H6z',

  chevron: 'm9 5 7 7-7 7', down: 'm6 9 6 6 6-6', folder: 'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',

  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',

  link: 'M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l2-2',

  refresh: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2',

  close: 'm6 6 12 12M6 18 18 6', clock: 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',

  shield: 'm12 3 8 4v5c0 5-8 9-8 9S4 17 4 12V7l8-4Zm-4 9 3 3 5-5',

  terminal: 'm4 6 5 6-5 6M12 18h8', copy: 'M8 8h12v13H8zM16 8V3H3v13h5',

  info: 'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', lock: 'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4',

  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.9M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',

};

const tooltipText = children => React.Children.toArray(children).map(child => React.isValidElement(child) ? tooltipText(child.props.children) : String(child)).join(' ').trim();
function TipButton({ children, title, ...props }) { const hint = title || props['aria-label'] || tooltipText(children); const button = <button {...props}>{children}</button>; return hint ? <Tooltip className="tip-host" content={hint} delay={600} size="sm" surfaceColor="#334666" inkColor="#e3edff">{button}</Tooltip> : button; }

function Icon({ name, size = 18, ...props }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.grid} /></svg>; }

function BrandMark({ large = false }) { return <svg className={large ? 'brand-mark large' : 'brand-mark'} viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="m11 11 18 18M11 29l18-18" stroke="currentColor" strokeWidth="2"/><rect x="5" y="5" width="12" height="12" rx="4" fill="currentColor"/><rect x="23" y="23" width="12" height="12" rx="4" fill="currentColor"/><rect x="23" y="5" width="12" height="12" rx="4" stroke="currentColor" strokeWidth="2"/><rect x="5" y="23" width="12" height="12" rx="4" stroke="currentColor" strokeWidth="2"/></svg>; }

function Provider({ provider, size = '' }) { return <span className={`provider ${provider} ${size}`} aria-label={provider === 'claude' ? 'Claude Code' : 'Codex'}>{provider === 'claude' ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 2v20M2 12h20M5 5l14 14M5 19 19 5M8 3l8 18M3 8l18 8M3 16l18-8M8 21l8-18"/></svg> : <Icon name="terminal" size={20}/>}</span>; }

const providerName = p => p === 'claude' ? 'Claude Code' : 'Codex';

const time = value => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

const relative = value => { const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000)); return !Number.isFinite(minutes) ? 'Unknown' : minutes < 1 ? 'Just now' : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`; };



function Modal({ title, children, onClose, description, error }) {

  const ref = useRef(null);

  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);

  return <dialog ref={ref} className="modal" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) onClose(); }} aria-labelledby="dialog-title"><div className="modal-inner"><span className="modal-close-anchor"><TipButton className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></TipButton></span><h2 id="dialog-title">{title}</h2>{description && <p className="modal-description">{description}</p>}{error && <Toast inline open title="Action needs attention" description={error} duration={0} closeButton={false} background="#382539" color="#ffdfeb" fuse="none"/>}{children}</div></dialog>;

}



function friendlyAgentError(agent) {
  if (agent.errorInfo) return agent.errorInfo;
  if (!agent.error) return null;
  const text = String(agent.error);
  if (/EPERM|EACCES|permission denied/i.test(text)) return { title: 'The CLI could not start', message: 'The local server does not have permission to launch this coding tool.', recovery: 'Restart Connect from a regular PowerShell window with access to the installed CLI, then retry your message.', code: 'PROCESS_PERMISSION', details: 'The operating system denied process startup.' };
  if (/auth|login|sign in|credentials/i.test(text)) return { title: 'Sign in to the coding tool', message: 'The CLI could not authenticate this request.', recovery: `Open ${providerName(agent.provider)} in your terminal, sign in, then retry your message.`, code: 'AUTHENTICATION' };
  if (/timeout|exceeded|time limit/i.test(text)) return { title: 'The agent reached its time limit', message: 'This turn ended before a response was completed.', recovery: 'Check your CLI connection, then retry with a smaller task.', code: 'TIME_LIMIT' };
  return { title: 'This agent needs attention', message: text, recovery: 'Review the error, fix the underlying issue, then retry your message or start a new turn.', code: 'AGENT_ERROR' };
}
function AgentError({ agent, onDetails }) { const info = friendlyAgentError(agent); return info ? <TipButton className="agent-error-link" onClick={() => onDetails(info)}><Icon name="info" size={14}/><span>{info.title || 'Needs attention'}</span><Icon name="chevron" size={13}/></TipButton> : null; }
function MessageDelivery({ message, agents, busy, onRun, onDetails }) {
  const dispatch = message.dispatch;
  const recipients = dispatch?.recipients || [];
  const outcomes = recipients.length ? recipients.filter(item => item.status !== 'skipped' && item.status !== 'failed') : dispatch ? [...(dispatch.running || []), ...(dispatch.queued || []), ...(dispatch.relaying || []), ...(dispatch.answered || []), ...(dispatch.completed || [])] : [];
  const failures = recipients.length ? recipients.filter(item => item.status === 'failed') : dispatch?.errors || [];
  const skipped = recipients.length ? recipients.filter(item => item.status === 'skipped') : dispatch?.skipped || [];
  const noteOnly = dispatch?.mode === 'note' || (skipped.length > 0 && skipped.every(item => item.code === 'NOTE_ONLY'));
  const working = outcomes.some(item => item.status === 'running' || item.status === 'queued') || (!recipients.length && outcomes.some(item => agents.find(agent => agent.id === item.agentId)?.status === 'running'));
  const failed = failures.length > 0;
  const answered = outcomes.some(item => item.status === 'answered') || !!dispatch?.answered?.length;
  const completed = outcomes.some(item => item.status === 'completed') || !!dispatch?.completed?.length;
  const relaying = outcomes.some(item => item.status === 'relaying') || !!dispatch?.relaying?.length;
  const canRun = agents.some(agent => agent.status !== 'external');
  const label = !dispatch ? 'Saved message. Run it to request an agent response.' : noteOnly ? 'Saved as a note. No agent was asked to respond.' : failed ? 'Some recipients could not respond.' : working ? 'Agents are working on this message.' : answered ? 'Agent response received.' : completed ? 'Turn completed without a text response.' : relaying ? 'Forwarded to the live relay. Awaiting the terminal response.' : outcomes.length ? 'Message dispatched to the selected agents.' : 'No agent was started.';
  return <div className={`message-delivery ${failed ? 'failed' : working ? 'working' : ''}`}><div className="delivery-heading"><Icon name={failed ? 'info' : working ? 'clock' : 'check'} size={13}/><span>{label}</span>{canRun && !working && <TipButton className="text-button" disabled={!!busy} onClick={() => onRun(message)}><Icon name="bolt" size={12}/>{failed ? 'Retry message' : noteOnly || !dispatch || !outcomes.length ? 'Run this message' : 'Run again'}</TipButton>}</div>{outcomes.length > 0 && <p className="delivery-recipients">{outcomes.map(item => { const agent = agents.find(value => value.id === item.agentId); const status = item.status || (agent?.status === 'running' ? 'working' : 'dispatched'); return `${item.name || agent?.name || 'Agent'}: ${status === 'answered' ? 'responded' : status === 'completed' ? 'finished without text' : status}`; }).join(' / ')}</p>}{failures.length > 0 && <TipButton className="text-button delivery-error-details" onClick={() => onDetails({title:'Message delivery failed',message:failures.map(failure=>`${failure.name || 'Agent'}: ${failure.errorInfo?.message || failure.reason || 'Could not start.'}`).join('\n'),recovery:failures.map(failure=>failure.errorInfo?.recovery).filter(Boolean).join('\n')})}>View delivery details<Icon name="chevron" size={12}/></TipButton>}{skipped.filter(item => item.code !== 'NOTE_ONLY').length > 0 && <TipButton className="text-button delivery-error-details" onClick={() => onDetails({title:'Some recipients were skipped',message:skipped.filter(item=>item.code!=='NOTE_ONLY').map(item=>`${item.name || 'Recipient'}: ${item.reason}`).join('\n')})}>View skipped recipients<Icon name="chevron" size={12}/></TipButton>}{!canRun && <p className="delivery-problem">Add a managed agent or connect a live relay to get a response.</p>}</div>;
}

function App() {

  const [state, setState] = useState(empty), [token, setToken] = useState(''), [connected, setConnected] = useState(false);

  const [roomId, setRoomId] = useState(()=>{try{return localStorage.getItem('connect-room')||'';}catch{return '';}}), [page, setPage] = useState('workspace'), [tab, setTab] = useState('conversation');

  const [modal, setModal] = useState(null), [error, setError] = useState(''), [toast, setToast] = useState(''), [busy, setBusy] = useState('');
  const [settingsTab, setSettingsTab] = useState('general'), [showAgents, setShowAgents] = useState(()=>matchMedia('(min-width:1100px)').matches), [showAutomation, setShowAutomation] = useState(false);
  useThemePreference();
  const [bootStatus, setBootStatus] = useState('loading'), [bootError, setBootError] = useState(''), [bootAttempt, setBootAttempt] = useState(0);
  const [errorDialog,setErrorDialog] = useState(null), [structuredError,setStructuredError] = useState(null), [showArchived,setShowArchived] = useState(false), [sessionArchive,setSessionArchive] = useState('active'), [notificationToast,setNotificationToast] = useState(null), [customFrom,setCustomFrom] = useState(''), [customUntil,setCustomUntil] = useState(''), [resetTurns,setResetTurns] = useState(false), [uploading,setUploading] = useState(false), [uploadedAttachments,setUploadedAttachments] = useState([]);
  const fileInput=useRef(null), fileResolve=useRef(null);
  const announcedErrors=useRef(new Set()), announcedNotifications=useRef(new Set()), announcedAssistance=useRef(new Set());
  const [assistanceToast,setAssistanceToast]=useState(null), [legal,setLegal]=useState({required:true,accepted:false});

  const [sessions, setSessions] = useState(null), [discovering, setDiscovering] = useState(false), [includeContext, setIncludeContext] = useState(false), [liveBridge, setLiveBridge] = useState(true);

  const [draft, setDraft] = useState(''), [recipient, setRecipient] = useState('all'), [runOnSend, setRunOnSend] = useState(true), [activity, setActivity] = useState({});

  const [taskTitle, setTaskTitle] = useState(''), [filter, setFilter] = useState('all'), [config, setConfig] = useState('');

  const [sessionQuery, setSessionQuery] = useState(''), [sessionStatus, setSessionStatus] = useState('all'), [sessionProvider, setSessionProvider] = useState('all'), [sessionLimit, setSessionLimit] = useState(12), [sessionAge, setSessionAge] = useState('24');
  const [selectedSession, setSelectedSession] = useState(null), [transcript, setTranscript] = useState(null), [transcriptBusy, setTranscriptBusy] = useState(false), [agentProvider, setAgentProvider] = useState('codex');
  const transcriptRequest = useRef(0);

  const bottom = useRef(null), stream = useRef(null), tokenRef = useRef('');

  const room = state.rooms.find(r => r.id === roomId) || state.rooms[0];

  const agents = state.agents.filter(a => a.roomId === room?.id), messages = state.messages.filter(m => m.roomId === room?.id), tasks = state.tasks.filter(t => t.roomId === room?.id), findings = state.findings.filter(f => f.roomId === room?.id);

  const agentById = id => state.agents.find(a => a.id === id);

  const matchingSessions = (sessions?.sessions || []).filter(session => (sessionArchive === 'all' || (sessionArchive === 'archived' ? !!state.hiddenSessions?.[session.id] : !state.hiddenSessions?.[session.id])) && (sessionAge !== 'custom' || ((!customFrom || new Date(session.lastActive) >= new Date(customFrom)) && (!customUntil || new Date(session.lastActive) <= new Date(customUntil)))) && (sessionAge === 'all' || sessionAge === 'custom' || Date.now() - new Date(session.lastActive).getTime() <= Number(sessionAge) * 3600000) && (sessionStatus === 'all' || session.status === sessionStatus) && (sessionProvider === 'all' || session.provider === sessionProvider) && `${session.title || ''} ${session.cwd || ''}`.toLocaleLowerCase().includes(sessionQuery.trim().toLocaleLowerCase())).sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));

  const visibleSessions = matchingSessions.slice(0, sessionLimit);

  const runningSessions = sessions?.sessions?.filter(session => session.status === 'running').length || 0;

  const notify = message => { setToast(message); };

  const api = useCallback(async (path, method = 'GET', body) => {

    const response = await fetch(path, { method, credentials: 'same-origin', signal: AbortSignal.timeout(45000), headers: { 'content-type': 'application/json', 'x-connect-token': tokenRef.current }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

    const result = await response.json();

    if (!response.ok) throw new Error(result.error || result.message || `Request failed (${response.status})`);

    return result;

  }, []);

  const refresh = useCallback(async () => { const result = await api('/api/state'); setState(result.state || result); }, [api]);

  useEffect(() => {

    let disposed = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    setBootStatus('loading'); setBootError('');

    async function connect() {

      try {

        const response = await fetch('/api/bootstrap', { credentials: 'same-origin', signal: controller.signal });

        if (!response.ok) throw new Error('The local server is unavailable. Start it with npm start.');

        const data = await response.json();
        if (!data.state || !['rooms','agents','messages','tasks','findings'].every(key=>Array.isArray(data.state[key])) || typeof data.token !== 'string') throw new Error('The local server returned an incomplete workspace. Restart Connect and try again.');
        clearTimeout(timeout);

        if (disposed) return;

        tokenRef.current = data.token; setToken(data.token); for(const item of data.state?.notifications||[])announcedNotifications.current.add(item.id);for(const agent of data.state?.agents||[])if(agent.error)announcedErrors.current.add(`${agent.id}:${agent.error}`);for(const item of data.state?.assistance||[])announcedAssistance.current.add(item.id); setState(data.state || empty); setConnected(true);setLegal(data.legal||{required:false,accepted:true});if(data.legal?.required)setModal('legal');

        setBootStatus('ready');
        const events = new EventSource('/api/events'); stream.current = events;

        events.addEventListener('state', event => { try { const next = JSON.parse(event.data); setState(next.state || next); setConnected(true); } catch {} });

        events.addEventListener('activity', event => { try { const next = JSON.parse(event.data); setActivity(prev => ({ ...prev, [next.agentId]: next.text })); } catch {} });

        events.onopen = () => setConnected(true); events.onerror = async () => {

          setConnected(false);

          try {

            const retry = await fetch('/api/bootstrap', { credentials: 'same-origin', signal: AbortSignal.timeout(8000) });

            if (!retry.ok || disposed) return;

            const next = await retry.json();

            if (disposed) return;

            tokenRef.current = next.token; setToken(next.token); setState(next.state || empty);

          } catch {}

        };

      } catch (err) { if(!disposed){setBootError(err.name==='AbortError'?'The local server took too long to respond. Check that Connect is running, then try again.':err.message);setBootStatus('error');setConnected(false);} } finally {clearTimeout(timeout);}

    }

    connect(); return () => { disposed = true; clearTimeout(timeout); controller.abort(); stream.current?.close(); };

  }, [bootAttempt]);

  useEffect(() => { setError(''); setStructuredError(null); }, [modal]);

  useEffect(() => { try{if (room?.id) localStorage.setItem('connect-room', room.id);}catch{} setRecipient('all'); setFilter('all'); }, [room?.id]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' }); }, [messages.length]);

  const act = async (key, callback) => { if(legal.required){setModal('legal');return;} setBusy(key); setError(''); setStructuredError(null); try { const result = await callback(); await refresh(); return result; } catch (err) { setError(err.message); } finally { setBusy(''); } };

  async function discover() { if(legal.required){setModal('legal');return;} setDiscovering(true); setError(''); try { const result = await api('/api/discover'); setSessions(result); if (!sessions) setSessionStatus(result.sessions?.some(session => session.status === 'running') ? 'running' : 'all'); setSessionLimit(12); } catch (err) { setError(err.message); } finally { setDiscovering(false); } }

  useEffect(() => { if (page === 'sessions' && token && !sessions && !discovering && !legal.required) discover(); }, [page, token, legal.required]);

  async function send(event) { event.preventDefault(); if (!draft.trim() || !room) return; const value = draft; const result = await act('send', () => api('/api/messages', 'POST', { roomId: room.id, to: recipient, text: value.trim(), run: runOnSend && agents.some(agent => agent.status !== 'external') })); if (result) { setDraft(''); if (result.dispatch?.mode === 'note') notify('Saved as a note. Use Run this message to request a response.'); } }

  async function sendPrompt(text, detail = {}) {
    if(legal.required){setModal('legal');return false;}
    if(!room || (!text.trim() && !detail.attachments?.length)) return false;
    if(room.archived){setError('This project is archived. Restore it from Project actions before sending messages.');return false;}
    if(!connected){setError('The local server is disconnected. Your draft is preserved. Wait for reconnection, then send again.');return false;}
    const result=await act('send',()=>api('/api/messages','POST',{roomId:room.id,to:recipient,text:text.trim(),attachments:(detail.attachments||[]).map(label=>uploadedAttachments.find(file=>file.label===label&&file.roomId===room.id)?.id).filter(Boolean),run:runOnSend&&agents.some(agent=>agent.status!=='external')}));
    if(!result)return false;
    setUploadedAttachments([]);
    if(result.dispatch?.mode==='note')notify('Saved as a note. Use Run this message to request an agent response.');
    return true;
  }
  function chooseFiles(){if(legal.required){setModal('legal');return;}if(!room||room.archived){setError('Choose an active project room before attaching files.');return;}return new Promise(resolve=>{fileResolve.current=resolve;fileInput.current.value='';fileInput.current.click();});}
  async function uploadFiles(event){
    const uploadRoomId=room?.id;const files=Array.from(event.target.files||[]);const resolveFiles=fileResolve.current;fileResolve.current=null;
    if(!files.length){resolveFiles?.([]);return;}
    if(files.length+uploadedAttachments.filter(file=>file.roomId===uploadRoomId).length>5){setError('Attach up to five files per message. Remove an attachment or send the current files first.');resolveFiles?.([]);return;}
    setUploading(true);const complete=[];
    try{for(const file of files){
      if(file.size>8*1024*1024){setError(`${file.name} is too large. Each file must be 8 MB or smaller.`);continue;}
      try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error(`Could not read ${file.name}.`));reader.readAsDataURL(file);});const result=await api('/api/uploads','POST',{roomId:uploadRoomId,name:file.name,type:file.type,data});const label=`${result.name} · ${result.size<1024?result.size+' B':Math.ceil(result.size/1024)+' KB'} · ${result.id.slice(0,4)}`;complete.push({...result,label});}catch(err){setError(`${file.name}: ${err.message}`);}
    }setUploadedAttachments(previous=>[...previous,...complete]);await refresh();resolveFiles?.(complete.map(file=>file.label));}finally{setUploading(false);}
  }
  async function saveSessionNotification(sessionId,enabled){try{await api('/api/session-notifications','PATCH',{sessionId,enabled});await refresh();notify(enabled?'Session notifications enabled.':'Session notifications muted.');}catch(err){setError(err.message);}}
  async function archiveSession(session){const archived=!!state.hiddenSessions?.[session.id];const result=await act(session.id,()=>api(`/api/sessions/${encodeURIComponent(session.id)}/archive`,'POST',{archived:!archived}));if(result)notify(archived?'Session restored to discovery.':'Session hidden from discovery. Its transcript is unchanged.');}
  async function importSession(session, partner) { if(legal.required){setModal('legal');return;} const result = await act(session.id, () => api('/api/import-session', 'POST', { sessionId: session.sessionId, provider: session.provider, partner, includeContext, liveBridge: liveBridge && session.provider === 'claude' && session.status === 'running' && partner === 'codex' })); if (result) { setRoomId(result.room.id); setPage('workspace'); setTab('conversation'); notify(`${providerName(partner)} added. ${result.bridge ? 'Live relay is connecting; check its verified status in the room.' : 'Send a message to start collaborating.'}`); } }

  async function loadTranscript(session, before = null) {
    const request = ++transcriptRequest.current; setTranscriptBusy(true); setError('');
    try {
      const query = new URLSearchParams({ provider: session.provider, limit: '50' });
      if (before !== null) query.set('before', String(before));
      const result = await api(`/api/sessions/${encodeURIComponent(session.id)}/transcript?${query}`);
      if (request !== transcriptRequest.current) return;
      setTranscript(previous => before !== null && previous ? { ...result, messages: [...result.messages, ...previous.messages].filter((message, index, all) => all.findIndex(item => item.id === message.id) === index) } : result);
    } catch (err) { if (request === transcriptRequest.current) setError(err.message); }
    finally { if (request === transcriptRequest.current) setTranscriptBusy(false); }
  }
  function openSession(session) { setSelectedSession(session); setTranscript(null); setPage('session-chat'); loadTranscript(session); }
  function newRoom() { setModal('room'); }

  useEffect(()=>{
    for(const agent of state.agents){
      if(!agent.error || agent.status!=='error')continue;
      const key=`${agent.id}:${agent.error}`;
      if(announcedErrors.current.has(key))continue;
      announcedErrors.current.add(key);
      const info=friendlyAgentError(agent);
      setStructuredError({...info,agentId:agent.id,agentName:agent.name,lastAttemptAt:agent.failedAt||agent.errorInfo?.failedAt||agent.lastActive}); setError(`${agent.name}: ${info?.title || 'needs attention'}. ${info?.message || ''}`);
    }
  },[state.agents]);
  useEffect(()=>{
    for(const item of state.notifications||[]){
      if(item.read || announcedNotifications.current.has(item.id))continue;
      announcedNotifications.current.add(item.id);
      if(item.channels?.inApp!==false && !(item.kind==='error' && item.agentId) && item.kind!=='assistance')setNotificationToast(item);
      if(item.channels?.browser && 'Notification' in window && Notification.permission==='granted')new Notification(item.title,{body:item.message,tag:item.id});
      if(item.channels?.sound){try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){const context=new Audio(),oscillator=context.createOscillator(),gain=context.createGain();oscillator.connect(gain);gain.connect(context.destination);oscillator.frequency.value=740;gain.gain.setValueAtTime(.03,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.18);oscillator.start();oscillator.stop(context.currentTime+.18);oscillator.onended=()=>context.close();}}catch{}}
    }
  },[state.notifications]);
  useEffect(()=>{for(const request of state.assistance||[]){if(request.status!=='open'||announcedAssistance.current.has(request.id))continue;announcedAssistance.current.add(request.id);setAssistanceToast(request);}},[state.assistance]);
  useEffect(()=>{if(error){setToast('');setNotificationToast(null);}},[error]);
  const roomAssistance=(state.assistance||[]).filter(request=>request.roomId===room?.id&&request.status==='open');
  const running = state.agents.filter(a => a.status === 'running').length;
  const needsAttention = state.agents.filter(agent => agent.status === 'error' || agent.bridgeStatus === 'error').length;
  async function runMessage(message) { await act(message.id, () => api(`/api/messages/${message.id}/run`, 'POST', {})); }



  if(bootStatus!=='ready')return <StartupScreen error={bootStatus==='error'?bootError:''} onRetry={()=>setBootAttempt(value=>value+1)}/>;
  return <TooltipGroup delay={600} warmWindow={400}><div className="app-shell">

    <aside className="sidebar">

      <a href="#" className="brand" onClick={e => { e.preventDefault(); setPage('workspace'); }} aria-label="Connect workspace"><BrandMark/><span>connect<span className="brand-period">.</span></span><span className="beta">LOCAL</span></a>

      <div className="workspace-switch"><span className="workspace-avatar">R</span><div><strong>My workspace</strong><span>Local collaboration</span></div></div>

      <nav className="main-nav" aria-label="Main navigation">

        <TipButton aria-label="Workspace" title="Workspace" className={page === 'workspace' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('workspace')}><Icon name="grid"/><span>Workspace</span></TipButton>

        <TipButton aria-label="Live sessions" title="Live sessions" className={page === 'sessions' || page === 'session-chat' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('sessions')}><Icon name="scan"/><span>Live sessions</span><span className="nav-dot"/></TipButton>

        <TipButton aria-label="Connections" title="Connections" className={page === 'connections' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('connections')}><Icon name="link"/><span>Connections</span></TipButton>

      </nav>

      <div className="section-label"><span>Projects</span><TipButton className="icon-button" onClick={newRoom} aria-label="Create project room"><Icon name="plus" size={16}/></TipButton></div>

      <div className="project-list">{state.rooms.length ? state.rooms.filter(item=>showArchived || !item.archived).map(r => <TipButton key={r.id} aria-label={`Open project ${r.name}`} className={`project-item ${room?.id === r.id && page === 'workspace' ? 'selected' : ''}`} onClick={() => { setRoomId(r.id); setPage('workspace'); }}><Icon name="folder" size={16}/><span>{r.name}{r.archived?' · archived':''}</span><span className="room-agent-count">{state.agents.filter(a => a.roomId === r.id).length}</span></TipButton>) : <p className="sidebar-empty">Your projects will live here.</p>}</div>

      {state.rooms.some(item=>item.archived)&&<TipButton className="archive-sidebar-toggle" aria-label={showArchived?'Hide archived projects':'Show archived projects'} onClick={()=>setShowArchived(!showArchived)}>{showArchived?'Hide archived projects':'Show archived projects'}</TipButton>}<TipButton className="new-project" onClick={newRoom}><Icon name="plus" size={16}/> New project room</TipButton>

      <div className="sidebar-bottom"><TipButton className="nav-item" aria-label="Workspace settings" title="Settings" onClick={() => {setSettingsTab('general');setModal('settings');}}><Icon name="settings"/><span>Settings</span>{state.notifications?.some(item=>!item.read)&&<span className="nav-dot" aria-label="Unread activity"/>}</TipButton><div className="connection-line"><span className={`status-dot ${connected ? 'online' : 'offline'}`}/><span>{connected ? 'Connected locally' : 'Reconnecting…'}</span></div><div className="creator-watermark">By <a href="https://rajeshkumarg.com" target="_blank" rel="noopener noreferrer">Rajesh Kumar G</a></div></div>

    </aside>



    <main className="main-shell">

      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={13}/><strong>{page === 'session-chat' ? 'Session transcript' : page === 'sessions' ? 'Live sessions' : page === 'connections' ? 'Connections' : room?.name || 'Overview'}</strong></div><div className="topbar-end"><span className={`runtime-indicator ${needsAttention ? 'needs-attention' : ''}`}><span className={`status-dot ${needsAttention ? 'error' : running ? 'online pulse' : connected ? 'online' : 'offline'}`}/>{needsAttention ? `${needsAttention} agent${needsAttention === 1 ? '' : 's'} need${needsAttention === 1 ? 's' : ''} attention` : running ? `${running} agent${running === 1 ? '' : 's'} working` : connected ? 'Server connected' : 'Server disconnected'}</span></div></header>

      



      {legal.required&&<div className="legal-readonly"><Icon name="shield" size={16}/><span>Read-only until you review the local workspace terms.</span><TipButton className="button secondary small" onClick={()=>setModal('legal')}>Review terms</TipButton></div>}
      {page === 'sessions' ? <section className="discovery-page page-content">

        <div className="page-heading"><div><h1>Find your other perspective.</h1><p>Bring another AI into the project you’re already working on.</p></div><TipButton className="button secondary" onClick={discover} disabled={discovering || !connected}><Icon name="refresh" size={16} className={discovering ? 'spin' : ''}/>{discovering ? 'Scanning…' : 'Refresh sessions'}</TipButton></div>

        <HoverSurface className="discovery-info" spotlightColor="#a9bcff" intensity={0.12} grain={0} ambient={false} style={{"--hover-surface-background":"#182237","--hover-surface-shadow":"none"}}><span className="discovery-scan"><Icon name="scan" size={24}/></span><div><strong>One project. Another set of eyes.</strong><p>Open a session to read its chat, or add a partner to collaborate. Your current terminal keeps running.</p></div></HoverSurface>

        <div className="list-heading"><h2>Sessions on this machine <span className="count">{sessions?.sessions?.length ?? '—'}</span></h2><AnimatedCheck label="Include recent conversation context" checked={includeContext} onChange={setIncludeContext} fontSize={12} boxSize={18} doneOpacity={1} fillColor="#b5c6ff" checkColor="#17223c" color="#c3d4f2" strike="none"/></div>

        <div className="bridge-option"><AnimatedCheck label="Connect running Claude sessions through a live relay" checked={liveBridge} onChange={setLiveBridge} fontSize={12} boxSize={18} doneOpacity={1} fillColor="#b5c6ff" checkColor="#17223c" color="#c3d4f2" strike="none"/><small>Uses an additional Claude worker. Requires native session messaging.</small></div><div className="session-toolbar"><label className="session-search"><Icon name="scan" size={17}/><span className="sr-only">Search sessions by project or folder</span><input type="search" placeholder="Search projects or folders…" value={sessionQuery} onChange={e => { setSessionQuery(e.target.value); setSessionLimit(12); }}/></label><label className="session-filter"><span className="sr-only">Last active</span><AnimatedSelect aria-label="Last active" value={sessionAge} onChange={e => { setSessionAge(e.target.value); setSessionLimit(12); }}><option value="1">Last hour</option><option value="24">Today (24h)</option><option value="168">Last 7 days</option><option value="720">Last 30 days</option><option value="all">Any time</option><option value="custom">Custom range</option></AnimatedSelect></label><label className="session-filter"><span className="sr-only">Session status</span><AnimatedSelect aria-label="Session status" value={sessionStatus} onChange={e => { setSessionStatus(e.target.value); setSessionLimit(12); }}><option value="all">All discovered</option><option value="running">Running ({runningSessions})</option><option value="recent">Recent</option></AnimatedSelect></label><label className="session-filter"><span className="sr-only">Coding tool</span><AnimatedSelect aria-label="Provider" value={sessionProvider} onChange={e => { setSessionProvider(e.target.value); setSessionLimit(12); }}><option value="all">All tools</option><option value="claude">Claude Code</option><option value="codex">Codex</option></AnimatedSelect></label><label className="session-filter"><span className="sr-only">Archived sessions</span><AnimatedSelect aria-label="Archived sessions" value={sessionArchive} onChange={event=>{setSessionArchive(event.target.value);setSessionLimit(12);}}><option value="active">Visible sessions</option><option value="archived">Archived sessions</option><option value="all">Visible and archived</option></AnimatedSelect></label></div>{sessionAge==='custom'&&<div className="custom-date-range"><label>Active from<AnimatedDateTimePicker value={customFrom} onChange={setCustomFrom} label="Active after date and time"/></label><label>Active until<AnimatedDateTimePicker value={customUntil} onChange={setCustomUntil} label="Active before date and time"/></label></div>}<p className="session-result-count" role="status">{sessions ? `Showing ${visibleSessions.length} of ${matchingSessions.length} matching sessions · ${sessions.sessions.length} discovered` : 'Scan your machine to find sessions.'}</p><div className="session-grid">{discovering && !sessions ? <div className="state-empty"><ActivityLoader label="Loading" color="#b8cbff" cellSize={5} glow={false}/><h3>Looking for your agents</h3><p>Checking local processes and recent session metadata.</p></div> : visibleSessions.length ? visibleSessions.map(session => <HoverSurface className="session-card" key={session.id} spotlightColor="#b1c2ff" intensity={0.1} grain={0} ambient={false} style={{"--hover-surface-background":"#141b2a","--hover-surface-shadow":"none"}}>

          <TipButton className="session-open-area" onClick={() => openSession(session)} aria-label={`Open ${providerName(session.provider)} chat for ${session.title || session.cwd || 'this session'}`}>
            <span className="session-top"><Provider provider={session.provider}/><span className="session-heading"><strong>{providerName(session.provider)}</strong><span className={`session-status ${session.status === 'running' ? 'live' : ''}`}><span className={`status-dot ${session.status === 'running' ? 'online' : ''}`}/>{session.status === 'running' ? 'Running process matched' : 'Recent session'}</span></span><span className="session-time" >{relative(session.lastActive)}</span></span>
            <span className="session-project-title">{session.title || session.cwd?.split(/[\\/]/).filter(Boolean).pop() || 'Untitled session'}</span><span className="session-path">{session.cwd || 'Project path unavailable'}</span>
            <span className="session-evidence">{typeof session.evidence === 'string' ? session.evidence : 'Detected from local session metadata.'}</span>
          </TipButton>
          <div className="session-extra-actions"><Tooltip content="Notifications for this session"><span><NotificationToggle size="sm" pressed={state.settings?.notifications?.perSession?.[session.id]===true} onChange={value=>saveSessionNotification(session.id,value)} offLabel="Muted" onLabel="Notify" background="#263754" onBackground="#49609d"/></span></Tooltip><TipButton className="icon-button" aria-label={state.hiddenSessions?.[session.id]?'Restore session to discovery':'Archive session from discovery'} onClick={()=>archiveSession(session)}><Icon name="folder" size={15}/></TipButton></div><div className="session-bottom"><TipButton className="button secondary small" onClick={() => openSession(session)}><Icon name="message" size={14}/>Open chat</TipButton><TipButton className="button primary small" disabled={!!busy || !session.cwd || session.importable === false} onClick={() => importSession(session, session.provider === 'claude' ? 'codex' : 'claude')}><Icon name="plus" size={14}/>{busy === session.id ? 'Adding...' : `Add ${session.provider === 'claude' ? 'Codex' : 'Claude'}`}</TipButton></div>
        </HoverSurface>) : <div className="state-empty"><Icon name="scan" size={34}/><h3>{sessions?.sessions?.length ? 'No sessions match these filters.' : 'No sessions found yet'}</h3><p>{sessions?.sessions?.length ? 'Try another project name, choose Any time, or change the status and tool filters.' : 'Open Claude Code or Codex in a project, then refresh. You can also create a room with a project path.'}</p>{sessions?.sessions?.length > 0 && <TipButton className="button secondary" onClick={() => { setSessionQuery(''); setSessionStatus('all'); setSessionProvider('all'); setSessionAge('all'); setSessionLimit(12); }}>Clear filters</TipButton>}<TipButton className="button secondary" onClick={newRoom}><Icon name="plus" size={16}/>Create a project room</TipButton></div>}</div>

        {matchingSessions.length > sessionLimit && <div className="load-sessions"><TipButton className="button secondary" onClick={() => setSessionLimit(limit => limit + 12)}>Load {Math.min(12, matchingSessions.length - sessionLimit)} more sessions<Icon name="down" size={16}/></TipButton><span>{matchingSessions.length - sessionLimit} more match your filters</span></div>}

        {sessions?.warnings?.length > 0 && <div className="notice"><Icon name="info" size={18}/><div>{sessions.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</div></div>}

        <div className="notice subtle"><Icon name="info" size={18}/><p>Discovery reads local metadata. Adding a partner shares the project path and, if selected, a context snapshot. Existing terminal sessions are not automatically connected to the room’s message channel. Recent activity alone does not prove a session is running.</p></div>

      </section> : page === 'session-chat' && selectedSession ? <section className="transcript-page page-content">
        <TipButton className="text-button transcript-back" onClick={() => setPage('sessions')}><Icon name="chevron" size={15} style={{transform:'rotate(180deg)'}}/>Back to sessions</TipButton>
        <div className="transcript-heading"><Provider provider={selectedSession.provider} size="big"/><div><h1>{selectedSession.title || providerName(selectedSession.provider)}</h1><p>{providerName(selectedSession.provider)} <span className="transcript-readonly">Read-only transcript</span></p></div><TipButton className="button secondary small" onClick={() => loadTranscript(selectedSession)} disabled={transcriptBusy}><Icon name="refresh" size={15} className={transcriptBusy ? 'spin' : ''}/>{transcriptBusy ? 'Loading...' : 'Refresh'}</TipButton></div>
        <div className="transcript-metadata"><p><Icon name="folder" size={14}/><span>{selectedSession.cwd || 'Project path unavailable'}</span></p><p><Icon name="clock" size={14}/><span>Last active {selectedSession.lastActive ? new Date(selectedSession.lastActive).toLocaleString() : 'unknown'}</span></p><p><Icon name="link" size={14}/><code>{selectedSession.sessionId}</code></p></div>
        <div className="transcript-action-bar"><p>Opening this chat reads saved messages. Your terminal session keeps running.</p><TipButton className="button primary small" disabled={!!busy || !selectedSession.cwd || selectedSession.importable === false} onClick={() => importSession(selectedSession, selectedSession.provider === 'claude' ? 'codex' : 'claude')}><Icon name="plus" size={14}/>{busy === selectedSession.id ? 'Adding...' : `Add ${selectedSession.provider === 'claude' ? 'Codex' : 'Claude'}`}</TipButton></div>
        <div className="transcript-log" aria-label="Saved session messages">{transcript?.hasMore && <div className="transcript-pagination"><TipButton className="button secondary small" onClick={() => loadTranscript(selectedSession, transcript.nextCursor)} disabled={transcriptBusy}>{transcriptBusy ? 'Loading...' : 'Load earlier messages'}<Icon name="down" size={14} style={{transform:'rotate(180deg)'}}/></TipButton></div>}{transcript?.messages?.length ? transcript.messages.map(message => <article className={`transcript-message ${message.role}`} key={message.id}><div className="transcript-message-meta">{message.role === 'user' ? <span className="human-avatar">Y</span> : message.role === 'assistant' ? <Provider provider={selectedSession.provider}/> : <span className="system-avatar"><Icon name="info" size={15}/></span>}<strong>{message.role === 'user' ? 'You' : message.role === 'assistant' ? providerName(selectedSession.provider) : message.role}</strong>{message.timestamp && <time dateTime={message.timestamp}>{new Date(message.timestamp).toLocaleString()}</time>}</div><p>{message.text}</p></article>) : <div className="state-empty">{transcriptBusy ? <ActivityLoader label="Loading" color="#b8cbff" cellSize={5} glow={false}/> : <Icon name="message" size={32}/>}<h3>{transcriptBusy ? 'Opening your conversation...' : 'No saved chat messages found.'}</h3><p>{transcriptBusy ? 'Reading local user and assistant messages. No model is running.' : 'This session may contain only tool activity, or its conversation has not been saved yet. Refresh after its next message.'}</p></div>}</div>
        {transcript?.truncated && <div className="notice subtle"><Icon name="info" size={16}/><p>Some message text was shortened for this preview. The original session file is unchanged.</p></div>}{transcript?.warnings?.length > 0 && <div className="notice subtle"><Icon name="info" size={16}/><div>{transcript.warnings.map((warning,index) => <p key={index}>{warning}</p>)}</div></div>}
      </section> : page === 'connections' ? <section className="connections-page page-content">

        <div className="page-heading"><div><h1>Your agents, on the same page.</h1><p>Connect the tools you already use. Keep their existing CLI authentication.</p></div></div>

        <div className="integration-list">{['claude', 'codex'].map(provider => <div className="integration-row" key={provider}><Provider provider={provider} size="big"/><div><h2>{providerName(provider)}</h2><p>{provider === 'claude' ? 'Programmatic sessions, streaming output, and scoped MCP tools.' : 'Non-interactive sessions, persistent threads, and scoped MCP tools.'}</p><code>{provider === 'claude' ? 'claude -p --output-format stream-json' : 'codex exec --json'}</code></div><TipButton className="button secondary" onClick={() => { setAgentProvider(provider); if (!room) newRoom(); else { setPage('workspace'); setModal('agent'); } }}><Icon name="plus" size={16}/>Add to room</TipButton></div>)}</div>

        <div className="connection-help"><Icon name="terminal" size={25}/><div><h3>Already signed in? You’re ready.</h3><p>Connect uses your installed CLIs and their existing credentials. If an agent reports an authentication error, sign in using that tool’s terminal command, then try again.</p></div></div>

        <div className="connection-help"><Icon name="link" size={25}/><div><h3>Bring an MCP-compatible agent</h3><p>Add a managed agent to a project room, then open its connection config. The scoped MCP bridge exposes room context, messages, tasks, and review findings.</p></div></div>

      </section> : !room ? <section className="welcome-page">

        <div className="welcome-orbit" aria-hidden="true"><div className="orbit-line orbit-one"/><div className="orbit-line orbit-two"/><span className="orbit-agent claude"><Provider provider="claude"/></span><span className="orbit-agent codex"><Provider provider="codex"/></span><span className="orbit-center"><BrandMark large/></span><span className="orbit-point point-one"/><span className="orbit-point point-two"/></div>

        <h1>Different minds.<br/><span>One shared workspace.</span></h1><p className="welcome-description">Give Claude Code and Codex a place to collaborate.<br className="desktop-break"/> Share ideas, challenge decisions, and catch what one agent misses.</p>

        <div className="welcome-actions"><AccentAction as="button" className="button primary discover-accent" color="#cfdaff" backgroundColor="#b5beff" textColor="#161b30" borderColor="#aebcff" radius={7} duration={7} sparkle={false} onClick={() => setPage('sessions')}><Icon name="scan" size={17}/>Discover live sessions<Icon name="arrow" size={17}/></AccentAction><TipButton className="button secondary" onClick={newRoom}><Icon name="plus" size={17}/>New project room</TipButton></div>

        <div className="welcome-proof"><span><Icon name="shield" size={15}/>Runs on your machine</span><span><Icon name="link" size={15}/>Uses your existing CLI login</span><span><Icon name="users" size={15}/>You stay in control</span></div>

        <div className="workflow-strip"><div><span className="workflow-number">1</span><div><strong>Bring your project</strong><p>Find a session or choose a folder.</p></div></div><Icon name="chevron" size={17}/><div><span className="workflow-number">2</span><div><strong>Add another perspective</strong><p>Give each agent a clear role.</p></div></div><Icon name="chevron" size={17}/><div><span className="workflow-number">3</span><div><strong>Build. Review. Refine.</strong><p>Follow the conversation as it happens.</p></div></div></div>

      </section> : <section className="workspace-page">

        <div className="room-header"><div><div className="room-title"><h1>{room.name}</h1><span className="room-status"><span className={`status-dot ${room.archived?'':'online'}`}/>{room.archived?'Archived':'Room open'}</span></div><p className="repo-path"><Icon name="folder" size={14}/>{room.path}</p></div><div className="room-actions"><TipButton className="button secondary small" aria-label="Toggle agent panel" aria-expanded={showAgents} onClick={()=>setShowAgents(!showAgents)}><Icon name="users" size={15}/><span>Agents</span><span className="count">{agents.length}</span></TipButton><TipButton className="button primary small" onClick={() => setModal('agent')}><Icon name="plus" size={15}/>Add agent</TipButton><TipButton className="icon-button" aria-label="Project actions" onClick={()=>setModal('project-actions')}><Icon name="more" size={17}/></TipButton></div></div>

        <div className={`workspace-body ${showAgents?'agents-visible':'agents-hidden'}`}><div className="workspace-center"><div className="project-tabs-bar"><SegmentedTabs items={[{value:'conversation',label:<span className="project-tab-label"><Icon name="message" size={15}/>Conversation{messages.filter(message=>message.from!=='system').length>0&&<span className="count">{messages.filter(message=>message.from!=='system').length}</span>}</span>},{value:'tasks',label:<span className="project-tab-label"><Icon name="task" size={15}/>Tasks{tasks.filter(task=>task.status!=='done').length>0&&<span className="count">{tasks.filter(task=>task.status!=='done').length}</span>}</span>},{value:'findings',label:<span className="project-tab-label"><Icon name="bug" size={15}/>Findings{findings.filter(finding=>finding.status==='open').length>0&&<span className="count">{findings.filter(finding=>finding.status==='open').length}</span>}</span>}]} value={tab} onChange={setTab} size="sm" trackColor="#111d31" thumbColor="#354a75" textColor="#a7bbdf" activeTextColor="#e5edff" radius={8} aria-label="Project view" className="project-tabs"/><span className="feed-label"><span className={`status-dot ${connected?'online':''}`}/>{connected?'LIVE':'OFFLINE'}</span></div>
          {tab === 'conversation' ? <><div className="message-scroll">{!messages.some(message=>message.from!=='system')&&<div className="room-start"><span className="room-start-symbol"><BrandMark/></span><h2>What are we working on?</h2><p>Describe a task. Your agents can build, review, and work through it together.</p></div>}{messages.map(message => { const author = agentById(message.from); const target = agentById(message.to); return message.from === 'system' ? <div className="system-message" key={message.id}><span/>{message.text}<span/></div> : <article className="message" key={message.id}><span className="message-avatar">{author ? <Provider provider={author.provider}/> : <span className="human-avatar">Y</span>}</span><div className="message-content"><div className="message-meta"><strong>{author?.name || 'You'}</strong>{author && <span className="role-tag">{author.role}</span>}<span className="message-target"><Icon name="arrow" size={12}/>{message.to === 'all' ? 'Everyone' : target?.name || message.to}</span><time dateTime={message.createdAt}>{time(message.createdAt)}</time></div><p className="message-text">{message.text}</p>{message.attachmentDetails?.length>0&&<div className="message-attachments">{message.attachmentDetails.map(file=><span key={file.id}><Icon name="folder" size={13}/>{file.name}<small>{Math.ceil(file.size/1024)} KB</small></span>)}</div>}{message.from === 'human' && <MessageDelivery message={message} agents={agents} busy={busy} onRun={runMessage} onDetails={info=>setErrorDialog(info)}/>}</div></article>; })}{agents.filter(a => a.status === 'running').map(agent => <div className="agent-thought" key={agent.id}><Provider provider={agent.provider}/><ProgressLine label={`${agent.name} is working`} steps={activity[agent.id]?[activity[agent.id].slice(-140)]:[]} working collapsible={false} color="#b8c9ed" glyphColor="#a9baff" fontSize={12} showTimer/></div>)}<div ref={bottom}/></div>

          <div className="composer-wrap"><div className="composer-options"><span className="composer-target"><Icon name="users" size={14}/><AnimatedSelect searchable aria-label="Message recipients" value={recipient} onChange={event=>setRecipient(event.target.value)}><option value="all">Everyone</option>{agents.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</AnimatedSelect></span><AnimatedCheck label="Send and run" checked={runOnSend} onChange={setRunOnSend} disabled={!agents.some(agent=>agent.status!=='external')||!!room.archived} fontSize={11} boxSize={18} doneOpacity={1} fillColor="#afc2ff" checkColor="#17213b" color="#bed0f1" strike="none"/></div><input ref={fileInput} className="sr-only" type="file" multiple accept=".txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.go,.rs,.html,.css,.xml,.yml,.yaml,.pdf,.png,.jpg,.jpeg,.webp" onChange={uploadFiles} onCancel={()=>{fileResolve.current?.([]);fileResolve.current=null;}} aria-label="Upload files"/><ChatComposer key={room.id} attachments={uploadedAttachments.filter(file=>file.roomId===room.id).map(file=>file.label)} value={draft} onChange={setDraft} placeholder={room.archived?'This project is archived. Restore it to send messages.':agents.length?'Ask your agents or describe a task…':'Leave a note or add your first agent...'} sources={[{key:'files',name:'Attach files',description:'Images, PDF, text, or source · up to 8 MB',attach:true}]} commands={[]} models={[]} efforts={[]} onAttach={chooseFiles} onAttachmentsChange={labels=>setUploadedAttachments(previous=>previous.filter(file=>labels.includes(file.label)))} busy={busy==='send'||uploading} background="#141f32" color="#e0eaff" menuBackground="#263853" sparkColor="#b3c5ff" width={1200} radius={11} className="connect-chat-composer" onSend={sendPrompt} onStop={()=>act('stop',()=>api(`/api/rooms/${room.id}/stop`,'POST',{}))}/><div className="composer-hint"><span>{uploading?'Uploading files... · ':''}{runOnSend&&agents.some(agent=>agent.status!=='external')?'Send & run recipients':'Save note only'} · Enter to send</span><span>{runOnSend&&agents.some(agent=>agent.status!=='external')?'Uses your CLI quota.':'Agents will not respond to a note.'}</span></div></div></> : tab === 'tasks' ? <div className="tab-content"><div className="list-heading"><h2>Keep the work in focus</h2><span>{tasks.filter(t => t.status === 'done').length} completed</span></div><form noValidate className="inline-form" onSubmit={async e => { e.preventDefault(); if (!taskTitle.trim()) return; const result = await act('task', () => api('/api/tasks', 'POST', { roomId: room.id, title: taskTitle.trim() })); if (result) setTaskTitle(''); }}><label className="sr-only" htmlFor="task-title">New task title</label><input id="task-title" placeholder="What needs to happen?" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} maxLength={240}/><TipButton className="button primary small" disabled={!taskTitle.trim() || !!busy}><Icon name="plus" size={15}/>Add task</TipButton></form>{tasks.length ? <div className="task-list">{tasks.map(task => <div className={`task-row ${task.status === 'done' ? 'completed' : ''}`} key={task.id}><AnimatedCheck checked={task.status==='done'} onChange={checked=>act(task.id,()=>api(`/api/tasks/${task.id}`,'PATCH',{status:checked?'done':'open'}))} ariaLabel={`${task.status==='done'?'Reopen':'Complete'} ${task.title}`} boxSize={18} boxRadius={4} doneOpacity={1} strike="none" fillColor="#b3c6ff" checkColor="#17233d" color="#cfdef8"/><div className="task-info"><strong>{task.title}</strong><span>{task.status.replace('_', ' ')}</span></div><label className="sr-only" htmlFor={`owner-${task.id}`}>Task owner</label><AnimatedSelect id={`owner-${task.id}`} className="compact-select" value={task.owner || ''} onChange={e => act(task.id, () => api(`/api/tasks/${task.id}`, 'PATCH', { owner: e.target.value || null, status: e.target.value ? 'in_progress' : 'open' }))}><option value="">Unassigned</option>{agents.map(agent => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</AnimatedSelect></div>)}</div> : <div className="state-empty"><Icon name="task" size={32}/><h3>Make the next step explicit.</h3><p>Add a task and assign an owner. Agents can claim work through the room’s MCP tools.</p></div>}</div> : <div className="tab-content"><div className="list-heading"><h2>Another pair of eyes</h2><TipButton className="button secondary small" onClick={() => setModal('finding')}><Icon name="plus" size={14}/>Log finding</TipButton></div><SegmentedTabs items={['all','open','resolved','disputed'].map(value=>({value,label:value}))} value={filter} onChange={setFilter} size="sm" trackColor="#15223a" thumbColor="#425885" textColor="#a9bcdf" activeTextColor="#edf3ff" aria-label="Filter review findings" className="findings-segment"/>{findings.filter(f => filter === 'all' || f.status === filter).length ? findings.filter(f => filter === 'all' || f.status === filter).map(finding => <article className="finding" key={finding.id}><div className="finding-heading"><span className={`severity ${finding.severity}`}>{finding.severity}</span><strong>{finding.title}</strong><AnimatedSelect aria-label={`Status for ${finding.title}`} className="compact-select" value={finding.status} onChange={e => act(finding.id, () => api(`/api/findings/${finding.id}`, 'PATCH', { status: e.target.value }))}>{['open', 'resolved', 'disputed'].map(value => <option key={value}>{value}</option>)}</AnimatedSelect></div><p>{finding.detail}</p>{(finding.file || finding.revision) && <code>{finding.file}{finding.revision && ` @ ${finding.revision}`}</code>}</article>) : <div className="state-empty"><Icon name="bug" size={32}/><h3>{filter === 'all' ? 'Good reviews leave evidence.' : `No ${filter} findings.`}</h3><p>{filter === 'all' ? 'Ask an agent to review a change. Findings belong here with a file, revision, and a reproducible explanation.' : 'Change the filter to see other review findings.'}</p></div>}</div>}

        </div>

        <aside className="room-aside"><div className="aside-heading"><h2>Agents <span className="count">{agents.length}</span></h2><TipButton className="icon-button" aria-label="Hide agent panel" onClick={()=>setShowAgents(false)}><Icon name="close" size={17}/></TipButton></div><div className="agent-roster">{agents.length ? agents.map(agent => <div className={`agent-card ${agent.status === 'running' ? 'working' : ''}`} key={agent.id}><div className="agent-top"><Provider provider={agent.provider}/><div><strong>{agent.name}</strong><span>{providerName(agent.provider)}</span></div><span className={`status-dot ${agent.status === 'running' ? 'online pulse' : agent.status === 'error' ? 'error' : ''}`}/></div><div className="agent-detail"><span className="role-tag">{agent.role === 'builder' ? 'Builder · edits enabled' : agent.role === 'bridge' ? 'Live session relay' : agent.status === 'external' ? 'Existing session' : 'Reviewer · read only'}</span><span className={`agent-state ${agent.status}`}>{agent.status === 'external' ? 'In terminal' : agent.status}</span></div>{agent.bridgeStatus && <p className={`bridge-status ${agent.bridgeStatus}`}>Live link: {agent.bridgeStatus}</p>}{agent.error && <AgentError agent={agent} onDetails={info=>setErrorDialog({...info,agentId:agent.id,agentName:agent.name,lastAttemptAt:agent.failedAt||agent.errorInfo?.failedAt||agent.lastActive})}/>}<div className="agent-actions"><TipButton className="text-button" onClick={() => act(agent.id, () => api(`/api/agents/${agent.id}/${agent.status === 'running' ? 'stop' : 'run'}`, 'POST', agent.status === 'running' ? {} : { prompt: draft.trim() || 'Read the project and room context. Introduce your role briefly and identify the most useful next step. Do not edit files unless explicitly assigned a build task.' }))} disabled={!!busy || agent.status === 'external' || !!room.archived}><Icon name={agent.status === 'running' ? 'stop' : 'bolt'} size={13}/>{agent.status === 'running' ? 'Stop agent' : 'Start turn'}</TipButton><TipButton className="icon-button" aria-label={`MCP config for ${agent.name}`} onClick={async () => { setConfig(''); setModal({ type: 'config', agent }); try { const result = await api(`/api/agents/${agent.id}/config`); setConfig(JSON.stringify(result, null, 2)); } catch (err) { setConfig(err.message); } }}><Icon name="link" size={14}/></TipButton></div></div>) : <div className="empty-roster"><div className="empty-agent-symbol"><Icon name="users" size={24}/></div><h3>Better together.</h3><p>Add a builder, a reviewer, or a critic. Each brings a different perspective.</p><TipButton className="button secondary small" onClick={() => setModal('agent')}><Icon name="plus" size={14}/>Add your first agent</TipButton></div>}</div>

          <div className="room-controls"><button type="button" className="automation-heading" aria-expanded={showAutomation} onClick={()=>setShowAutomation(!showAutomation)}><span>Automation</span><Icon name="down" size={14}/></button>{showAutomation&&<div className="automation-content"><div className="plan-control-summary"><TipButton className="button secondary full" onClick={()=>setModal('plan')}><Icon name="shield" size={14}/>Plan &amp; failover{room.approvedPlan?.approvedAt&&<span className="plan-approved-dot" aria-label="Plan approved"/>}</TipButton><p>{room.approvedPlan?.approvedAt?room.failoverEnabled?'Approved plan · quota failover enabled':'Approved plan · failover off':'Approve a plan to allow scoped continuation.'}</p></div>{roomAssistance.length>0&&<div className="assistance-control"><TipButton className="button assistance-button full" onClick={()=>setModal({type:'assistance',request:roomAssistance[0]})}><Icon name="info" size={14}/>Review assistance<span className="count">{roomAssistance.length}</span></TipButton><p>An agent needs your decision before continuing.</p></div>}<div className="toggle-line"><div><strong>Automatic replies</strong><span>Let agents respond to each other.</span></div><TipButton className={`toggle ${room.autoReply ? 'on' : ''}`} role="switch" aria-checked={!!room.autoReply} aria-label="Automatic agent replies" disabled={!!busy} onClick={() => act('auto', () => api(`/api/rooms/${room.id}`, 'PATCH', { autoReply: !room.autoReply }))}><span/></TipButton></div><div className="turn-budget"><span>Turn budget</span><strong>{room.turns || 0} <span>/ {room.maxTurns || 8}</span></strong></div><div className="budget-track"><span style={{ width: `${Math.min(100, ((room.turns || 0) / (room.maxTurns || 8)) * 100)}%` }}/></div><p className="control-note">A turn starts a CLI run. The budget bounds automatic exchanges.</p><TipButton className="button stop-all" disabled={!agents.some(a => a.status === 'running') || !!busy} onClick={() => act('stop', () => api(`/api/rooms/${room.id}/stop`, 'POST', {}))}><Icon name="stop" size={14}/>Stop room</TipButton></div>}{!showAutomation&&roomAssistance.length>0&&<TipButton className="button assistance-button full" onClick={()=>setModal({type:'assistance',request:roomAssistance[0]})}><Icon name="info" size={14}/>Review assistance<span className="count">{roomAssistance.length}</span></TipButton>}</div>

          <div className="aside-tip"><Icon name="info" size={16}/><p>Start with a specific question. Independent reviews work best with a concrete change and clear acceptance criteria.</p></div>

        </aside></div>

      </section>}

    </main>



    {toast && !error && !assistanceToast && !notificationToast && !modal && !errorDialog && <Toast key={`notice-${toast}`} open title="Connect" description={toast} onClose={() => setToast('')} closeButton background="#203b36" color="#d5f6e8" fuseColor="#99ddc2" width={380} duration={5000}/>}{error && !modal && !errorDialog && <Toast key={`error-${error}`} open title="Action needs attention" description={error} onClose={() => setError('')} actionLabel="View details" onAction={() => {setErrorDialog(structuredError||{title:'Action needs attention',message:error});setError('');setStructuredError(null);}} closeButton background="#3b263a" color="#ffe1ec" fuseColor="#eaa9c2" width={410} duration={9000}/>}{notificationToast && !error && !assistanceToast && !modal && !errorDialog && <Toast key={notificationToast.id} open title={notificationToast.title} description={notificationToast.message} onClose={() => setNotificationToast(null)} closeButton background="#223c59" color="#e2efff" width={390} duration={6500}/>}
    {assistanceToast && !error && !modal && !errorDialog && <Toast key={assistanceToast.id} open title="Your decision is needed" description={assistanceToast.question||assistanceToast.title||'An agent requested assistance.'} onClose={()=>setAssistanceToast(null)} actionLabel="Review assistance" onAction={()=>{setRoomId(assistanceToast.roomId);setPage('workspace');setModal({type:'assistance',request:assistanceToast});setAssistanceToast(null);}} closeButton background="#3b3454" color="#f0e6ff" fuseColor="#bea8ff" width={410} duration={12000}/>}
    {errorDialog && <Modal title={errorDialog.title || 'Action needs attention'} onClose={() => setErrorDialog(null)} description={errorDialog.message}><div className="error-dialog-content">{errorDialog.lastAttemptAt&&<p className="error-attempt-time">Previous attempt failed: {new Date(errorDialog.lastAttemptAt).toLocaleString()}</p>}{errorDialog.recovery && <div><h3>How to recover</h3><p>{errorDialog.recovery}</p></div>}{(errorDialog.code || errorDialog.details) && <details><summary>Technical details</summary><pre>{errorDialog.code}{errorDialog.details ? `\n${typeof errorDialog.details==='string'?errorDialog.details:JSON.stringify(errorDialog.details,null,2)}`:''}</pre></details>}<div className="error-dialog-actions">{errorDialog.agentId&&<TipButton className="button primary" disabled={!!busy} onClick={async()=>{const id=errorDialog.agentId;setErrorDialog(null);await act(id,()=>api(`/api/agents/${id}/run`,'POST',{prompt:'Retry the previously requested turn. Inspect the current room context before acting. Do not repeat completed work.'}));}}>Retry agent</TipButton>}<TipButton className="button secondary" onClick={()=>setErrorDialog(null)}>Got it</TipButton></div></div></Modal>}

    {modal === 'room' && <Modal error={error} title="Bring your project." description="Create a shared room around a local project folder." onClose={() => setModal(null)}><form noValidate className="modal-form" onSubmit={async e => { e.preventDefault(); const data = new FormData(e.currentTarget); const result = await act('room', () => api('/api/rooms', 'POST', { name: data.get('name'), path: data.get('path') })); if (result) { setRoomId(result.room?.id || result.id); setPage('workspace'); setModal(null); notify('Project room created. Add an agent to get started.'); } }}><label>Project name<input name="name" required autoFocus placeholder="My next project" maxLength={100}/></label><label>Project folder<input name="path" required placeholder="P:\Projects\my-project" spellCheck="false"/><span>Use the absolute path to an existing local folder.</span></label><div className="form-note"><Icon name="shield" size={16}/><p>Your files stay in their folder. Agents access this project using their CLI permissions.</p></div><TipButton className="button primary full" disabled={!!busy}>{busy === 'room' ? 'Creating…' : 'Create project room'}<Icon name="arrow" size={16}/></TipButton></form></Modal>}

    {modal === 'agent' && <Modal error={error} title="Add another perspective." description="Choose the coding tool and give it a clear role." onClose={() => setModal(null)}><form noValidate className="modal-form" onSubmit={async e => { e.preventDefault(); const data = new FormData(e.currentTarget); const result = await act('agent', () => api('/api/agents', 'POST', { roomId: room.id, name: data.get('name'), provider: data.get('provider'), role: data.get('role') })); if (result) { setModal(null); notify('Agent added. Start a turn or send it a message.'); } }}><label>Agent name<input name="name" required autoFocus placeholder="Code reviewer" maxLength={80}/></label><label>Coding tool<AnimatedSelect name="provider" defaultValue={agentProvider}><option value="codex">Codex</option><option value="claude">Claude Code</option></AnimatedSelect></label><label>Role<AnimatedSelect name="role"><option value="reviewer">Reviewer — read only</option><option value="builder">Builder — edits enabled</option></AnimatedSelect><span>Reviewers inspect code. Builders can change files in this project.</span></label><div className="form-note"><Icon name="info" size={16}/><p>Adding an agent does not start a model run. Use Start turn, or send a message with Send and run enabled.</p></div><TipButton className="button primary full" disabled={!!busy}>{busy === 'agent' ? 'Adding…' : 'Add agent'}<Icon name="plus" size={16}/></TipButton></form></Modal>}

    {modal === 'finding' && <Modal error={error} title="Leave a useful finding." description="Describe the failure and the evidence another agent can verify." onClose={() => setModal(null)}><form noValidate className="modal-form" onSubmit={async e => { e.preventDefault(); const data = new FormData(e.currentTarget); const result = await act('finding', () => api('/api/findings', 'POST', { roomId: room.id, title: data.get('title'), detail: data.get('detail'), severity: data.get('severity'), file: data.get('file'), revision: data.get('revision') })); if (result) setModal(null); }}><label>Finding title<input name="title" required autoFocus placeholder="What can go wrong?" maxLength={240}/></label><label>Explanation<textarea name="detail" required placeholder="Trigger, impact, and how to reproduce it" rows={4} maxLength={12000}/></label><div className="form-columns"><label>Severity<AnimatedSelect name="severity"><option value="medium">Medium</option><option value="high">High</option><option value="low">Low</option></AnimatedSelect></label><label>Revision<input name="revision" placeholder="Commit or revision"/></label></div><label>File reference<input name="file" placeholder="src/example.ts:42"/></label><TipButton className="button primary full" disabled={!!busy}>Log finding<Icon name="plus" size={16}/></TipButton></form></Modal>}

    {modal === 'settings' && <Modal error={error} title="Settings" description="Make this workspace work for you." onClose={() => setModal(null)}><div className="settings-shell"><SegmentedTabs items={[{value:'general',label:'General'},{value:'notifications',label:'Notifications'},{value:'activity',label:'Activity'}]} value={settingsTab} onChange={setSettingsTab} aria-label="Settings section" className="settings-tabs"/><section className="settings-panel" role="tabpanel" aria-label={settingsTab==='general'?'General settings':settingsTab==='notifications'?'Notification settings':'Recent activity'}>{settingsTab==='general'?<><div className="settings-appearance"><div><h3>Appearance</h3><p>Choose a theme that feels comfortable.</p></div><ThemeControl/></div><h3 className="settings-group-title">Room limits</h3>{room && <form noValidate className="modal-form" onSubmit={async e => { e.preventDefault(); const data = new FormData(e.currentTarget); const result = await act('settings', () => api(`/api/rooms/${room.id}`, 'PATCH', { maxTurns: Number(data.get('maxTurns')), resetTurns: resetTurns })); if (result) { setModal(null); notify('Room settings updated.'); } }}><label>Maximum turns for {room.name}<input type="number" name="maxTurns" min="1" max="50" defaultValue={room.maxTurns || 8} required/></label><AnimatedCheck checked={resetTurns} onChange={setResetTurns} label="Reset this room’s used turns" fontSize={12} boxSize={18} doneOpacity={1} strike="none"/><TipButton className="button primary full" disabled={!!busy}>Save room settings<Icon name="check" size={16}/></TipButton></form>}<details className="settings-technical"><summary>About this workspace</summary><div className="settings-info"><div><span>Server</span><code>{location.origin}</code></div><div><span>Storage</span><code>.connect/state.json</code></div><div><span>Agent runtime</span><strong>Your installed CLI tools</strong></div></div><p className="settings-footnote">Provider tools use their own permissions and quota. Connect coordinates them locally.</p></details></>:settingsTab==='notifications'?<NotificationsSettings settings={state.settings} reminders={state.customNotifications||[]} api={api} refresh={refresh} notify={notify} onError={setError} Check={AnimatedCheck} Bell={NotificationToggle}/>:<div className="notification-history"><h3>Recent activity</h3>{state.notifications?.length?state.notifications.slice().reverse().slice(0,30).map(item=><TipButton key={item.id} className={`notification-history-item ${item.read?'read':''}`} onClick={()=>act(item.id,()=>api(`/api/notifications/${item.id}/read`,'POST',{}))}><strong>{item.title}</strong><span>{item.message}</span><time>{new Date(item.createdAt).toLocaleString()}</time></TipButton>):<div className="settings-empty"><Icon name="message" size={24}/><h3>You’re all caught up</h3><p>Agent updates and reminders will appear here.</p></div>}</div>}</section></div></Modal>}

    {modal==='legal'&&<Modal title="Before you connect" description="Review how the local workspace and your independent coding tools work together." onClose={()=>setModal(null)} error={error}><LegalConsent legal={legal} api={api} onError={setError} onAccepted={async()=>{const status=await api('/api/legal');setLegal(status.legal||status);setModal(null);notify('Acceptance saved. Your coding tools keep their existing permissions.');}}/></Modal>}
    {modal==='plan'&&room&&<Modal title="Plan & failover" description="Approve the scope you want agents to continue, and choose what happens when one provider runs out of quota." onClose={()=>setModal(null)} error={error}><PlanSettings key={room.id} room={room} agents={agents} handoffs={(state.handoffs||[]).filter(item=>item.roomId===room.id)} api={api} refresh={refresh} notify={notify} onError={setError}/></Modal>}
    {modal?.type==='assistance'&&<Modal title="Review assistance" description="Your response is a human decision. Agents cannot grant themselves new permissions or approve a changed plan." onClose={()=>setModal(null)} error={error}><AssistanceReply key={modal.request.id} request={(state.assistance||[]).find(item=>item.id===modal.request.id)||modal.request} agents={state.agents.filter(agent=>agent.roomId===modal.request.roomId)} api={api} refresh={refresh} notify={notify} onError={setError} onClose={()=>setModal(null)}/></Modal>}

    {modal==='project-actions'&&room&&<Modal title={room.name} description="Archive the Connect room or remove its local coordination history. Your project files and native agent sessions are never deleted." onClose={()=>setModal(null)} error={error}><div className="project-action-section"><h3>{room.archived?'Restore project room':'Archive project room'}</h3><p>{room.archived?'Bring this room back to your active project list.':'Stop its managed agents and move this room out of your active list. You can restore it later.'}</p><UndoAction key={`${room.id}-${room.archived}`} label={room.archived?'Restore room':'Archive room'} undoLabel="Undo" doneLabel={room.archived?'Restored':'Archived'} undoWindow={5000} commitOn="fuseEnd" settle="reset" color="#e5edff" background="#344b74" fuseColor="#b1c5ff" size="md" onCommit={async()=>{const result=await act('archive',()=>api(`/api/rooms/${room.id}/archive`,'POST',{archived:!room.archived}));if(result){setModal(null);notify(room.archived?'Room restored.':'Room archived.');}return !!result;}}/></div><div className="project-action-section danger"><h3>Delete Connect history</h3><p>Permanently remove this room’s messages, tasks, findings, and managed agent entries from Connect.</p><TipButton className="button danger-button" onClick={()=>setModal('delete-room')}>Delete room history</TipButton></div></Modal>}
    {modal==='delete-room'&&room&&<Modal title="Delete this Connect room?" description={`This permanently removes Connect history for ${room.name}. Your repository and native session transcripts remain untouched.`} onClose={()=>setModal(null)} error={error}><form noValidate className="modal-form" onSubmit={async event=>{event.preventDefault();const data=new FormData(event.currentTarget);const result=await act('delete-room',()=>api(`/api/rooms/${room.id}`,'DELETE',{confirmName:data.get('confirmName')}));if(result){setModal(null);setRoomId('');notify('Connect room history deleted.');}}}><label>Type {room.name} to confirm<input name="confirmName" required autoFocus autoComplete="off"/></label><TipButton className="button danger-button full" disabled={!!busy}>Delete Connect history</TipButton></form></Modal>}
    {modal?.type === 'config'  && <Modal error={error} title={`${modal.agent.name} connection`} description="Scoped MCP configuration for this room and agent. Treat its capability token as a secret." onClose={() => setModal(null)}><pre className="config-code">{config || 'Loading connection config…'}</pre><TipButton className="button secondary full" disabled={!config} onClick={async () => { try { await navigator.clipboard.writeText(config); notify('Connection config copied.'); } catch { setError('Clipboard access was denied. Select and copy the configuration text.'); } }}><Icon name="copy" size={16}/>Copy configuration</TipButton></Modal>}

  </div></TooltipGroup>;

}



createRoot(document.getElementById('root')).render(<App/>);

