// Local browser verification through an installed Chromium. No downloads.
import { spawn } from 'node:child_process';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
export { delay };
export async function localBrowser({ port = 9462, output = resolve('output/visual-audit') } = {}) {
  await mkdir(output, { recursive: true }); const cache = join(process.env.LOCALAPPDATA, 'ms-playwright');
  const version = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort().reverse()[0];
  if (!version) throw new Error('No installed Chromium; browser verification cannot run.');
  const child = spawn(join(cache, version, 'chrome-win64', 'chrome.exe'), ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(output, 'profile')}`, '--no-first-run', '--disable-extensions', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let targets; for (let count = 0; count < 60; count++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.some(target => target.type === 'page')) break; } catch {} await delay(100); }
  if (!targets) { child.kill(); throw new Error('Browser did not start.'); }
  const ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl); await new Promise((yes, no) => { ws.onopen = yes; ws.onerror = no; });
  let sequence = 0; const pending = new Map(), errors = [], requests = [], listeners = new Map();
  ws.onmessage = event => { const item = JSON.parse(event.data); if (item.id) { const entry = pending.get(item.id); if (entry) { pending.delete(item.id); clearTimeout(entry.timer); item.error ? entry.no(new Error(item.error.message)) : entry.yes(item.result); } } if (item.method === 'Runtime.exceptionThrown') errors.push(item.params.exceptionDetails.exception?.description || item.params.exceptionDetails.text); if (item.method === 'Network.requestWillBeSent') requests.push(item.params.request.url); for(const listener of listeners.get(item.method)||[])listener(item.params); };
  const send = (method, params = {}) => new Promise((yes, no) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); no(new Error(`Browser timeout: ${method}`)); }, 15000); pending.set(id, { yes, no, timer }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
  const viewport = async (width, height = 1000) => { await send('Emulation.setDeviceMetricsOverride', { width, height, mobile: width < 650, deviceScaleFactor: 1 }); await delay(100); };
  const open = async url => { if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(url)) throw new Error('Browser QA is restricted to localhost.'); await send('Page.navigate', { url }); for (let n = 0; n < 60; n++) { if (await evaluate('document.readyState === "complete"')) break; await delay(100); } await delay(250); };
  const click = async selector => { const point = await evaluate(`(() => {const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('Missing control: '+${JSON.stringify(selector)});element.scrollIntoView({block:'nearest'});const r=element.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()`); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point }); await delay(100); };
  const shot = async name => { await writeFile(join(output, `${name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64')); };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  return { send, evaluate, viewport, open, click, shot, errors, requests, output, on(method,listener){if(!listeners.has(method))listeners.set(method,new Set());listeners.get(method).add(listener);return()=>listeners.get(method)?.delete(listener);}, close() { ws.close(); child.kill(); } };
}
