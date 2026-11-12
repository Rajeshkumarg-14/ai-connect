// Browser interaction and responsive checks against an isolated fixture server.
// No native sessions, real agents, or provider requests are used.
import {localBrowser,delay} from './cdp-browser.mjs';
import {writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const browser=await localBrowser({port:9463,output:resolve('output/workspace-audit')});
const checks=[];
const check=(ok,name)=>{checks.push({name,passed:!!ok});if(!ok)throw new Error(name);};
const wait=async(expression,timeout=7000)=>{const start=Date.now();while(Date.now()-start<timeout){if(await browser.evaluate(expression))return;await delay(60);}throw new Error(`Timed out: ${expression}`);};
const clickText=async(text,scope='document')=>{const selector=await browser.evaluate(`(()=>{const nodes=[...${scope}.querySelectorAll('button')],b=nodes.find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button: '+${JSON.stringify(text)});b.dataset.auditClick='target';return '[data-audit-click="target"]';})()`);await browser.click(selector);await browser.evaluate(`document.querySelector('[data-audit-click]')?.removeAttribute('data-audit-click')`);};
const openSettings=async()=>{await browser.click('[aria-label="Workspace settings"]');await wait(`!!document.querySelector('.settings-shell')`);};
const closeDialog=async()=>browser.click('dialog[open] [aria-label="Close dialog"]');
const bounds=()=>browser.evaluate(`(()=>{const root=document.documentElement,m=document.querySelector('dialog[open]');return root.scrollWidth<=innerWidth+1&&(!m||m.scrollWidth<=m.clientWidth+1);})()`);
try{
  await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const original=window.fetch.bind(window);window.__bootMode='slow';window.fetch=(url,options)=>{if(url!=='/api/bootstrap')return original(url,options);if(window.__bootMode==='slow')return new Promise(resolve=>setTimeout(()=>resolve(original(url,options)),1200));if(window.__bootMode==='fail')return Promise.resolve(new Response('{}',{status:503}));if(window.__bootMode==='malformed')return Promise.resolve(new Response(JSON.stringify({token:'fixture',state:{}}),{status:200}));if(window.__bootMode==='hang')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));return original(url,options);};})();`});
  await browser.viewport(1440,1000);await browser.open('http://127.0.0.1:4321/');
  check(await browser.evaluate(`!!document.querySelector('.startup-screen[aria-busy=true]')&& !document.querySelector('.welcome-page')`),'Loading displays a stable screen without flashing an empty workspace');await browser.shot('loading');
  await wait(`!!document.querySelector('.app-shell')`);check(true,'Successful startup replaces the loading screen');
  // Trigger bootstrap errors in the same document, then retry without a reload.
  const bootScript=await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__bootMode='fail';`});
  await browser.open('http://127.0.0.1:4321/');await wait(`!!document.querySelector('.startup-screen [role=alert]')`);
  check(await browser.evaluate(`document.querySelector('.startup-content').textContent.includes('unavailable')`),'Unavailable server shows an actionable startup error');await browser.shot('startup-error');
  await browser.evaluate(`window.__bootMode='normal'`);await clickText('Try again');await wait(`!!document.querySelector('.app-shell')`);check(true,'Startup retry recovers without reloading the page');
  await browser.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:bootScript.identifier});
  const malformed=await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__bootMode='malformed';`});
  await browser.open('http://127.0.0.1:4321/');await wait(`!!document.querySelector('.startup-screen [role=alert]')`);check(await browser.evaluate(`document.querySelector('[role=alert]').textContent.includes('incomplete workspace')`),'Malformed bootstrap data cannot crash the workspace');await browser.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:malformed.identifier});
  const hanging=await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__bootMode='hang';`});
  await browser.open('http://127.0.0.1:4321/');await wait(`!!document.querySelector('.startup-screen [role=alert]')`,10000);check(await browser.evaluate(`document.querySelector('[role=alert]').textContent.includes('too long')`),'Hung startup exits loading within eight seconds and offers retry');await browser.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:hanging.identifier});
  await browser.evaluate(`window.__bootMode='normal'`);await clickText('Try again');await wait(`!!document.querySelector('.app-shell')`);
  await browser.evaluate(`(async()=>{const b=await(await fetch('/api/bootstrap')).json();if(!b.state.rooms.length){await fetch('/api/rooms',{method:'POST',headers:{'content-type':'application/json','x-connect-token':b.token},body:JSON.stringify({name:'Visual QA room',path:${JSON.stringify(process.cwd())}})});location.reload();}})()`);await wait(`!!document.querySelector('.workspace-page')`);
  for(const width of [360,390,768,1024,1440,1920]){
    await browser.viewport(width,width<700?844:1000);
    check(await bounds(),`${width}px workspace has no horizontal overflow`);
    check(await browser.evaluate(`!document.querySelector('.sidebar [aria-label="Notifications"]')`),`${width}px sidebar has one Settings entry instead of a separate notification entry`);
    if(await browser.evaluate(`document.querySelector('[aria-label="Toggle agent panel"]').getAttribute('aria-expanded')==='true'`))await browser.click('[aria-label="Toggle agent panel"]');
    check(await browser.evaluate(`getComputedStyle(document.querySelector('.room-aside')).display==='none'`),`${width}px agent panel can be hidden`);
    check(await browser.evaluate(`(()=>{const t=document.querySelector('.chat-composer textarea'),r=t.getBoundingClientRect();return r.width>150&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})()`),`${width}px composer remains visible and usable`);
    await browser.shot(`workspace-${width}`);
    await browser.click('[aria-label="Toggle agent panel"]');check(await browser.evaluate(`getComputedStyle(document.querySelector('.room-aside')).display!=='none'`),`${width}px agents remain accessible`);
    await browser.click('[aria-label="Hide agent panel"]');
    await openSettings();check(await bounds(),`${width}px Settings fits the viewport`);
    await clickText('Notifications','document.querySelector("dialog[open]")');check(await browser.evaluate(`!!document.querySelector('.notification-settings')`),`${width}px notification preferences open inside Settings`);check(await bounds(),`${width}px notification preferences do not overflow`);
    await browser.shot(`settings-${width}`);
    await clickText('Activity','document.querySelector("dialog[open]")');check(await browser.evaluate(`document.querySelector('dialog[open] h2').textContent==='Settings'&&!!document.querySelector('.notification-history')`),`${width}px recent activity stays in the same Settings dialog`);
    await clickText('General','document.querySelector("dialog[open]")');check(await browser.evaluate(`!!document.querySelector('.settings-appearance')`),`${width}px general settings remain accessible`);
    await closeDialog();
    await browser.click('.project-tabs [role=tab]:nth-of-type(1)');
    await browser.evaluate(`document.querySelectorAll('.project-tabs [role=tab]')[1].click()`);
    check(await browser.evaluate(`!!document.querySelector('#task-title')`)&&await bounds(),`${width}px Tasks and its entry form remain usable`);
    await browser.evaluate(`document.querySelectorAll('.project-tabs [role=tab]')[2].click()`);
    check(await browser.evaluate(`!!document.querySelector('.findings-segment')`)&&await bounds(),`${width}px Findings and its filters remain usable`);
    await clickText('Log finding');check(await bounds(),`${width}px finding form fits its modal`);await closeDialog();
    await browser.evaluate(`document.querySelectorAll('.project-tabs [role=tab]')[0].click()`);
    await clickText('Add agent');await browser.click('dialog[open] .animated-select:has(input[name=role]) .animated-select-trigger');check(await bounds(),`${width}px Role dropdown preserves the dialog`);
    await browser.click('dialog[open] .animated-select:has(input[name=role]) [role=option]:last-child');check(await browser.evaluate(`document.querySelector('dialog[open] input[name=role]').value==='builder'`),`${width}px Role selection works`);await closeDialog();
  }
  await browser.viewport(1440,1000);await openSettings();await clickText('Notifications','document.querySelector("dialog[open]")');await browser.click('[aria-label="Schedule a reminder"]');await browser.click('[aria-label="Reminder date and time"]');check(await browser.evaluate(`!!document.querySelector('.animated-calendar')`)&&await bounds(),'Reminder datetime picker opens inside Settings without overflow');await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await closeDialog();
  await openSettings();await browser.click('[aria-label^="Appearance:"]');await clickText('Light');await closeDialog();check(await browser.evaluate(`document.documentElement.dataset.theme==='light'`),'Light theme applies to the whole workspace');await browser.shot('workspace-light');
  await openSettings();await browser.click('[aria-label^="Appearance:"]');await clickText('Dark');await closeDialog();check(await browser.evaluate(`document.documentElement.dataset.theme==='dark'`),'Dark theme applies to the whole workspace');
  await browser.click('[aria-label="Toggle agent panel"]');await browser.click('.automation-heading');check(await browser.evaluate(`!!document.querySelector('.automation-content')`),'Automation settings expand without hiding agent status');await clickText('Plan & failover');check(await browser.evaluate(`!!document.querySelector('.plan-settings')`),'Approved-plan and failover controls remain reachable');await closeDialog();
  await browser.click('[aria-label="Live sessions"]');await wait(`!!document.querySelector('.session-card')`);check(await bounds(),'Session discovery remains responsive');
  await clickText('Open chat');await wait(`!!document.querySelector('.transcript-message')`);check(await browser.evaluate(`document.querySelector('.transcript-log').textContent.includes('Synthetic QA')`),'Session transcript opens from discovery');
  const blockedStorage=await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked storage','SecurityError');}});`});
  await browser.open('http://127.0.0.1:4321/');await wait(`!!document.querySelector('.app-shell')`);check(true,'Blocked browser storage does not prevent startup');
  await openSettings();await browser.click('[aria-label^="Appearance:"]');await clickText('Light');check(await browser.evaluate(`document.documentElement.dataset.theme==='light'`),'Theme remains usable when browser preference storage is blocked');await closeDialog();
  await browser.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:blockedStorage.identifier});
  check(browser.errors.length===0,'No uncaught browser exceptions in the tested flows');
  check(!browser.requests.some(url=>/^https?:/.test(url)&&!url.startsWith('http://127.0.0.1:4321/')),'Workspace makes no external HTTP requests');
}catch(error){checks.push({name:error.message,passed:false});await browser.shot('failure').catch(()=>{});process.exitCode=1;}
finally{await writeFile(join(browser.output,'report.json'),JSON.stringify({checks,errors:browser.errors},null,2));browser.close();}
console.log(JSON.stringify({checks:checks.length,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed),output:browser.output},null,2));
