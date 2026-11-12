// Original Connect landing-page interactions. MIT. No network requests.
const systemTheme = matchMedia('(prefers-color-scheme: light)');
let themeChoice; try { themeChoice = localStorage.getItem('connect-site-theme') || 'dark'; } catch { themeChoice = 'dark'; }
if (!['dark', 'light', 'system'].includes(themeChoice)) themeChoice = 'dark';
function applyTheme() { document.documentElement.dataset.theme = themeChoice === 'system' ? systemTheme.matches ? 'light' : 'dark' : themeChoice; document.querySelectorAll('[data-theme-toggle]').forEach(button => { button.textContent = themeChoice[0].toUpperCase() + themeChoice.slice(1); button.setAttribute('aria-label', `Color theme: ${themeChoice}. Change theme`); }); }
applyTheme(); systemTheme.addEventListener('change', applyTheme);
document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => { themeChoice = ['dark', 'light', 'system'][(['dark', 'light', 'system'].indexOf(themeChoice) + 1) % 3]; try { localStorage.setItem('connect-site-theme', themeChoice); } catch {} applyTheme(); }));
const scenarios = {
  discuss: { request: 'Before changing the cache, agree on the failure cases.', first: 'I’ll map the current behavior. Codex, check how expired entries are handled.', second: 'An expired entry can still win a race. Let’s cover that before implementation.', evidence: 'Decision recorded · add an expiry race test', label: 'Shared thinking', summary: 'Agents can challenge an approach before either writes the fix.', index: '01 / 03', role: 'Builder', partnerRole: 'Reviewer' },
  review: { request: 'Review the change against the approved plan. Show evidence.', first: 'The implementation is ready for review. Check the actual diff and the expiry test.', second: 'The failure path needs a clock-boundary case. I’ll record a finding with the affected revision.', evidence: 'Finding recorded · test the clock boundary', label: 'Independent review', summary: 'Findings stay with the project, together with the evidence and response.', index: '02 / 03', role: 'Builder', partnerRole: 'Reviewer' },
  continue: { request: 'Continue the approved plan if one provider reaches its limit.', first: 'My provider quota is exhausted. The room records the failed turn instead of silently retrying.', second: 'If I’m eligible and the plan is approved, I can continue within my existing role. Scope changes go back to you.', evidence: 'Bounded handoff · one automatic continuation per request', label: 'A deliberate handoff', summary: 'Failover preserves the approved scope and does not expand permissions.', index: '03 / 03', role: 'Quota limited', partnerRole: 'Builder' }
};
const tabs = [...document.querySelectorAll('[data-scenario]')];
function choose(tab) {
  const entry = scenarios[tab.dataset.scenario]; if (!entry) return;
  for (const button of tabs) { const active = button === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; }
  for (const [id, text] of Object.entries({ 'demo-request': entry.request, 'demo-first': entry.first, 'demo-second': entry.second, 'demo-evidence': entry.evidence, 'demo-role': entry.role, 'demo-partner-role': entry.partnerRole, 'demo-step': entry.label, 'demo-summary': entry.summary, 'demo-index': entry.index })) { const element = document.getElementById(id); if (element) element.textContent = text; }
  const panel = document.getElementById('scenario-panel'); panel?.setAttribute('aria-labelledby', tab.id); panel?.classList.remove('changing'); requestAnimationFrame(() => panel?.classList.add('changing'));
}
tabs.forEach((tab, index) => { tab.addEventListener('click', () => choose(tab)); tab.addEventListener('keydown', event => { const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null; if (next === null) return; event.preventDefault(); choose(tabs[next]); tabs[next].focus(); }); });
let toastTimer;
function notice(text) { const element = document.getElementById('site-toast'); if (!element) return; element.textContent = text; element.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('visible'), 3500); }
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => { try { await navigator.clipboard.writeText(button.dataset.copy); notice('Command copied.'); } catch { notice('Clipboard access is unavailable. Select and copy the command.'); } }));
const setupDialog = document.getElementById('setup-consent');
document.getElementById('review-setup')?.addEventListener('click', () => setupDialog?.showModal());
document.getElementById('close-consent')?.addEventListener('click', () => setupDialog?.close());
if (setupDialog) {
  const checks = [...setupDialog.querySelectorAll('input[type=checkbox]')], accept = setupDialog.querySelector('[data-accept]');
  checks.forEach(check => check.addEventListener('change', () => { accept.disabled = !checks.every(item => item.checked); }));
  accept?.addEventListener('click', () => { try { localStorage.setItem('connect-setup-acknowledgment', JSON.stringify({ version: '2026-11-12', acknowledgedAt: new Date().toISOString() })); } catch {} setupDialog.close(); notice('Setup notice acknowledged locally. The app will record its own acceptance before agent activity.'); document.getElementById('local-checklist')?.focus(); });
}
document.querySelectorAll('.faq-question').forEach(button => button.addEventListener('click', () => { const open = button.getAttribute('aria-expanded') !== 'true'; button.setAttribute('aria-expanded', String(open)); const panel = document.getElementById(button.getAttribute('aria-controls')); if (panel) panel.hidden = !open; }));
document.getElementById('issue-form')?.addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.currentTarget); const title = String(data.get('title') || '').trim(), actual = String(data.get('actual') || '').trim(); if (!title || !actual) { notice('Add a title and the observed behavior.'); return; } const draft = `# ${title}\n\n## What happened\n${actual}\n\n## Expected behavior\n${data.get('expected') || ''}\n\n## Steps to reproduce\n${data.get('steps') || ''}\n\n## Environment\n${data.get('environment') || ''}\n\nI have removed credentials, tokens, private paths, and session transcripts.\n`; document.getElementById('issue-draft').textContent = draft; document.getElementById('issue-result').hidden = false; document.getElementById('issue-result').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); });
document.getElementById('copy-issue')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(document.getElementById('issue-draft').textContent); notice('Issue draft copied. Nothing was submitted.'); } catch { notice('Select and copy the draft manually. Nothing was submitted.'); } });
// Keep content visible by default. Only below-the-fold sections opt into reveals.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
  const sections = [...document.querySelectorAll('.hero-product,.section-heading,.workflow-intro,.workflow-list article,.boundaries-inner>div,.boundary-table,.verification-copy,.test-ledger,.faq>div,.closing,.maker,.legal-main>h2')];
  const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-revealed'); observer.unobserve(entry.target); } }, { threshold: 0.08 });
  for (const element of sections) if (element.getBoundingClientRect().top > innerHeight - 20) { element.classList.add('reveal-ready'); observer.observe(element); }
}
