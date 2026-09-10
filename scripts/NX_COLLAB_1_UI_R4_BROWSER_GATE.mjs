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
if(!browserPath){console.error('FAIL R4 browser gate: Chrome/Edge/Chromium not found. Set CHROME_PATH.');process.exit(1)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){return await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port))})})}
async function waitJson(url,timeout=12000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const r=await fetch(url);if(r.ok)return await r.json()}catch(e){last=e}await sleep(120)}throw new Error(`Chrome DevTools did not become ready: ${last?.message||'timeout'}`)}
function cdp(wsUrl){
  const ws=new WebSocket(wsUrl);let id=0;const pending=new Map();const events=new Map();
  const ready=new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',()=>reject(new Error('CDP websocket error')),{once:true})});
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const {resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(new Error(m.error.message)):resolve(m.result)}else if(m.method){const list=events.get(m.method)||[];events.set(m.method,[]);for(const r of list)r(m.params)}});
  const send=async(method,params={})=>{await ready;const n=++id;return await new Promise((resolve,reject)=>{pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))})};
  const once=async(method,timeout=8000)=>await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`CDP event timeout ${method}`)),timeout);const list=events.get(method)||[];list.push(v=>{clearTimeout(timer);resolve(v)});events.set(method,list)});
  return {send,once,close:()=>ws.close(),ready};
}

const cases=[
  ...[['support',1440,900],['support',1280,800],['support',1024,768],['support',768,1024],['support',390,844],['support',360,800],['files',1440,900],['files',1024,768],['files',390,844],['access',1440,900],['access',390,844]].map(([mode,w,h])=>({surface:'admin',mode,w,h})),
  ...[['support',1440,900],['support',1280,800],['support',1024,768],['support',768,1024],['support',390,844],['support',360,800],['closed',1440,900],['closed',390,844],['execution',1440,900],['execution',1024,768],['execution',390,844],['overview',1440,900],['overview',390,844],['drawer',1440,900],['drawer',390,844]].map(([mode,w,h])=>({surface:'portal',mode,w,h}))
];
const port=await freePort();
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nexora-r4-browser-'));
const args=[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1','--headless=new','--disable-gpu','--disable-extensions','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'about:blank'];
if(process.platform!=='win32')args.unshift('--no-sandbox');
console.log('R4 browser engine: '+browserPath);
const child=spawn(browserPath,args,{stdio:['ignore','ignore','ignore']});
let failed=false;
try{
  await waitJson(`http://127.0.0.1:${port}/json/version`);
  const target=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());
  const client=cdp(target.webSocketDebuggerUrl);await client.ready;await client.send('Page.enable');
  const foundation=fs.readFileSync(path.join(root,'public','css','nexora-foundation.css'),'utf8');
  const adminCss=fs.readFileSync(path.join(root,'public','admin','css','admin.css'),'utf8');
  const portalCss=fs.readFileSync(path.join(root,'public','css','project-portal.css'),'utf8');
  for(const {surface,mode,w,h} of cases){
    const fixture=path.join(root,'tests',surface==='admin'?'nx-collab-1-r4-admin':'nx-collab-1-r4-portal',`${mode}-visual.html`);
    let html=fs.readFileSync(fixture,'utf8');
    html=html.replace('<link rel="stylesheet" href="../../public/css/nexora-foundation.css">',`<style>${foundation}</style>`);
    html=html.replace(surface==='admin'?'<link rel="stylesheet" href="../../public/admin/css/admin.css">':'<link rel="stylesheet" href="../../public/css/project-portal.css">',`<style>${surface==='admin'?adminCss:portalCss}</style>`);
    await client.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false});
    const tree=await client.send('Page.getFrameTree');
    await client.send('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html});
    await sleep(140);
    const gateId=surface==='admin'?'#nx-r4-visual-gate':'#nx-r4-portal-visual-gate';
    const result=await client.send('Runtime.evaluate',{expression:`(()=>{const e=document.querySelector('${gateId}');return e?{result:e.dataset.result,text:e.textContent,width:innerWidth,height:innerHeight}:null})()`,returnByValue:true});
    const v=result.result?.value;
    if(!v||v.result!=='PASS'){
      failed=true;console.error(`FAIL R4 browser ${surface}/${mode} ${w}x${h}: ${v?.text||'gate result missing'}`);
    }else console.log(`PASS R4 browser ${surface}/${mode} ${w}x${h}`);
  }
  client.close();
}catch(e){failed=true;console.error('FAIL R4 browser gate: '+e.message)}finally{
  child.kill('SIGTERM');await sleep(120);if(!child.killed)child.kill('SIGKILL');
  try{fs.rmSync(profile,{recursive:true,force:true})}catch{}
}
console.log(`NX_COLLAB_1_UI_R4_BROWSER_GATE_${failed?'FAIL':'PASS'}`);
process.exit(failed?1:0);
