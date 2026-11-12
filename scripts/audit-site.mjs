import {localBrowser,delay} from './cdp-browser.mjs';
import {writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const browser=await localBrowser({port:9464,output:resolve('output/site-audit')});
const checks=[];
const check=(ok,name)=>{checks.push({name,passed:!!ok});};
const base='http://127.0.0.1:4319/';
try{
  for(const width of [360,390,768,1024,1440,1920]){
    await browser.viewport(width,width<700?844:1000);
    for(const page of ['index','privacy','terms','license','security','get-started','contact','404']){
      await browser.open(`${base}${page}.html`);
      check(await browser.evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),`${page} at ${width}px has no horizontal overflow`);
      check(await browser.evaluate(`document.querySelectorAll('h1').length===1&&!!document.querySelector('main')`),`${page} at ${width}px has one page heading and main landmark`);
      check(await browser.evaluate(`(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return new Set(ids).size===ids.length;})()`),`${page} at ${width}px has unique element IDs`);
      if([390,1440].includes(width)&&['index','privacy','contact'].includes(page))await browser.shot(`${page}-${width}`);
    }
  }
  await browser.viewport(1440,1000);await browser.open(base);
  await browser.click('.faq-question');check(await browser.evaluate(`document.querySelector('.faq-question').getAttribute('aria-expanded')==='true'&&!document.getElementById(document.querySelector('.faq-question').getAttribute('aria-controls')).hidden`),'FAQ reveals its answer and accessible expanded state');
  await browser.click('.faq-question');check(await browser.evaluate(`document.querySelector('.faq-question').getAttribute('aria-expanded')==='false'`),'FAQ answer collapses again');
  await browser.click('[data-scenario=review]');check(await browser.evaluate(`document.querySelector('#demo-summary').textContent.includes('Findings')`),'Review scenario updates its explanatory content');
  await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});check(await browser.evaluate(`document.querySelector('[data-scenario=continue]').getAttribute('aria-selected')==='true'`),'Scenario tabs support keyboard navigation');
  await browser.evaluate(`document.querySelector('#workspace').scrollIntoView()`);await browser.shot('workspace-demo');
  for(const theme of ['light','dark']){
    for(let i=0;i<3&&await browser.evaluate('document.documentElement.dataset.theme')!==theme;i++)await browser.click('[data-theme-toggle]');
    check(await browser.evaluate('document.documentElement.dataset.theme')===theme,`${theme} theme applies to the landing page`);await browser.evaluate('scrollTo(0,0)');await browser.shot(`index-${theme}`);
  }
  await browser.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await browser.open(base);
  check(await browser.evaluate(`getComputedStyle(document.querySelector('.hero')).opacity!=='0'`),'Initial viewport remains visible when reveal animations are enabled');
  await browser.evaluate(`document.querySelector('#faq').scrollIntoView()`);await delay(900);check(await browser.evaluate(`getComputedStyle(document.querySelector('#faq')).opacity==='1'`),'Scrolled sections become visible after the reveal animation');await browser.shot('faq-reveal');
  await browser.open(`${base}contact.html`);await browser.evaluate(`(()=>{for(const[name,value]of [['title','Synthetic audit issue'],['actual','A local browser fixture report.']]){const el=document.querySelector('[name="'+name+'"]');el.value=value;}document.querySelector('#issue-form').requestSubmit();})()`);
  check(await browser.evaluate(`!document.querySelector('#issue-result').hidden&&document.querySelector('#issue-draft').textContent.includes('Synthetic audit issue')`),'Contact form creates a local issue draft without a remote submission');
  await browser.open(`${base}get-started.html`);await browser.click('#review-setup');check(await browser.evaluate(`!!document.querySelector('dialog[open]')&&document.querySelector('[data-accept]').disabled`),'Setup acknowledgment opens with unchecked consent');await browser.click('#close-consent');
  check(!browser.requests.some(url=>/^https?:/.test(url)&&!url.startsWith(base)),'Site pages make no external HTTP requests');check(browser.errors.length===0,'No uncaught browser exceptions across site pages');
}catch(error){checks.push({name:error.message,passed:false});await browser.shot('failure').catch(()=>{});}
finally{await writeFile(join(browser.output,'report.json'),JSON.stringify({checks,errors:browser.errors},null,2));browser.close();}
const failed=checks.filter(c=>!c.passed);console.log(JSON.stringify({checks:checks.length,passed:checks.length-failed.length,failed,output:browser.output},null,2));if(failed.length)process.exitCode=1;
