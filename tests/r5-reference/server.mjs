// Local UI proof server only. Never shipped under public/ or used for production.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const args=process.argv.slice(2), portArg=args.indexOf('--port');
const port=Number(portArg>=0?args[portArg+1]:process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  let target;
  if(url.pathname.startsWith('/api/')){res.writeHead(501);res.end('The UI proof has no backend.');return}
  if(url.pathname==='/admin/'){
    let html=fs.readFileSync(path.join(root,'public/admin/index.html'),'utf8');
    html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
    const en=url.searchParams.get('lang')==='en',light=url.searchParams.get('theme')==='light';
    html=html.replace(/<html[^>]*>/,`<html lang="${en?'en':'ar'}" dir="${en?'ltr':'rtl'}" data-theme="${light?'light':'dark'}">`);
    html=html.replace('</body>','<script type="module" src="/fixture.js"></script></body>');
    res.writeHead(200,{'Content-Type':types['.html'],'Cache-Control':'no-store'});res.end(html);return;
  }
  if(url.pathname==='/reference.html'){
    let html=fs.readFileSync(path.join(here,'approved-prototype.html'),'utf8');
    html=html.replace('file:///mnt/data/r5_work/public/assets/brand/nexora-logo-dark.png','/assets/brand/nexora-logo-dark.png');
    res.writeHead(200,{'Content-Type':types['.html'],'Cache-Control':'no-store'});res.end(html);return;
  }
  if(url.pathname==='/'||url.pathname==='/index.html')target=path.join(here,'index.html');
  else if(url.pathname==='/fixture.js')target=path.join(here,'fixture.js');
  else {
    const publicRoot=path.join(root,'public');
    target=path.resolve(publicRoot,'.'+decodeURIComponent(url.pathname));
    if(!target.startsWith(publicRoot+path.sep)){res.writeHead(404);res.end('Not found');return}
  }
  if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);res.end('Not found');return}
  res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(target).pipe(res);
}).listen(port,'0.0.0.0',()=>console.log(`Local UI proof is ready on port ${port}`));
