import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const candidates=[
  process.env.CHROME_PATH,
  process.platform==='win32'&&process.env.PROGRAMFILES?path.join(process.env.PROGRAMFILES,'Google','Chrome','Application','chrome.exe'):null,
  process.platform==='win32'&&process.env['PROGRAMFILES(X86)']?path.join(process.env['PROGRAMFILES(X86)'],'Google','Chrome','Application','chrome.exe'):null,
  process.platform==='win32'&&process.env.LOCALAPPDATA?path.join(process.env.LOCALAPPDATA,'Google','Chrome','Application','chrome.exe'):null,
  process.platform==='win32'&&process.env.PROGRAMFILES?path.join(process.env.PROGRAMFILES,'Microsoft','Edge','Application','msedge.exe'):null,
  '/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'
].filter(Boolean);
const browserPath=candidates.find(p=>fs.existsSync(p));
if(!browserPath){console.error('FAIL R4.1 browser gate: Chrome/Edge/Chromium not found. Set CHROME_PATH.');process.exit(1)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port))})})}
async function waitJson(url,timeout=12000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const r=await fetch(url);if(r.ok)return await r.json()}catch(e){last=e}await sleep(120)}throw new Error(`Chrome DevTools did not become ready: ${last?.message||'timeout'}`)}
function cdp(wsUrl){
  const ws=new WebSocket(wsUrl);let id=0;const pending=new Map();
  const ready=new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',()=>reject(new Error('CDP websocket error')),{once:true})});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const {resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result)}});
  const send=async(method,params={})=>{await ready;const n=++id;return await new Promise((resolve,reject)=>{pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))})};
  return {send,close:()=>ws.close(),ready};
}
const cases=[[1728,768],[1440,900],[1440,720],[1280,800],[1024,768],[768,1024],[390,844],[360,800]];
const port=await freePort();const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nexora-r4-1-browser-'));
const args=[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--headless=new','--disable-gpu','--disable-extensions','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'about:blank'];if(process.platform!=='win32')args.unshift('--no-sandbox');
console.log('R4.1 browser engine: '+browserPath);const child=spawn(browserPath,args,{stdio:['ignore','ignore','ignore']});let failed=false;
try{
  await waitJson(`http://127.0.0.1:${port}/json/version`);const target=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());const client=cdp(target.webSocketDebuggerUrl);await client.ready;await client.send('Page.enable');
  const foundation=fs.readFileSync(path.join(root,'public','css','nexora-foundation.css'),'utf8');const adminCss=fs.readFileSync(path.join(root,'public','admin','css','admin.css'),'utf8');let html=fs.readFileSync(path.join(root,'tests','nx-collab-1-r4-1-admin','support-containment-visual.html'),'utf8');html=html.replace('<link rel="stylesheet" href="../../public/css/nexora-foundation.css">',`<style>${foundation}</style>`).replace('<link rel="stylesheet" href="../../public/admin/css/admin.css">',`<style>${adminCss}</style>`);
  for(const [w,h] of cases){
    await client.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});const tree=await client.send('Page.getFrameTree');await client.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html});await sleep(140);
    const result=await client.send('Runtime.evaluate',{expression:`(()=>{const failures=[];const fail=m=>failures.push(m);const E=s=>document.querySelector(s);const R=s=>E(s)?.getBoundingClientRect()||null;const within=r=>r&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1;const threadEl=E('.admin-ticket-thread');const content=R('.project-workspace-content'),root=R('#projectSupportRoot'),support=R('.admin-support-workspace'),detail=R('.admin-ticket-detail'),shell=R('.admin-ticket-detail-shell'),thread=R('.admin-ticket-thread'),composer=R('.admin-ticket-composer'),textarea=R('.admin-composer-row textarea'),send=R('.admin-composer-row .primary-btn');if(!content||!root||!support||!detail||!shell||!thread||!composer||!textarea||!send)fail('real DOM chain missing');if(document.documentElement.scrollWidth>document.documentElement.clientWidth+1)fail('document horizontal overflow');if(document.documentElement.scrollHeight>document.documentElement.clientHeight+1)fail('document vertical overflow');if(root&&content&&Math.abs(root.height-content.height)>2)fail('projectSupportRoot does not fill content track');if(support&&root&&Math.abs(support.height-root.height)>2)fail('support workspace does not fill root');if(root&&!within(root))fail('support root clipped');if(detail&&!within(detail))fail('ticket detail clipped');if(shell&&detail&&(shell.bottom>detail.bottom+1||shell.top<detail.top-1))fail('detail shell escapes detail');if(composer&&detail&&(composer.bottom>detail.bottom+1||composer.top<detail.top-1))fail('composer escapes detail');if(composer&&!within(composer))fail('composer clipped by viewport');if(thread&&composer&&thread.bottom>composer.top+1)fail('thread overlaps composer');if(threadEl&&threadEl.scrollHeight<=threadEl.clientHeight)fail('long thread is not internally scrollable');if(textarea&&composer&&(textarea.bottom>composer.bottom+1||textarea.top<composer.top-1))fail('textarea escapes composer');if(send&&composer&&(send.bottom>composer.bottom+1||send.top<composer.top-1))fail('send button escapes composer');if(innerWidth<=430&&threadEl&&threadEl.clientHeight<72)fail('mobile thread usable height too small');return {failures,threadClient:threadEl?.clientHeight||0,threadScroll:threadEl?.scrollHeight||0,composer:composer?.height||0}})()`,returnByValue:true});
    const v=result.result?.value;if(v?.failures?.length){failed=true;console.error(`FAIL R4.1 browser admin/support-containment ${w}x${h}: ${v.failures.join(' | ')}`)}else console.log(`PASS R4.1 browser admin/support-containment ${w}x${h} thread=${v.threadClient}/${v.threadScroll} composer=${Math.round(v.composer)}`);
  }
  client.close();
}catch(e){failed=true;console.error('FAIL R4.1 browser gate: '+e.message)}finally{child.kill('SIGTERM');await sleep(120);if(!child.killed)child.kill('SIGKILL');try{fs.rmSync(profile,{recursive:true,force:true})}catch{}}
console.log(`NX_COLLAB_1_UI_R4_1_BROWSER_GATE_${failed?'FAIL':'PASS'}`);process.exit(failed?1:0);
