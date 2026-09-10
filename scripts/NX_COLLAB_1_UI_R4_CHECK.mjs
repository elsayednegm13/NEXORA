import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
let failed=false;const pass=m=>console.log('PASS '+m),fail=m=>{failed=true;console.error('FAIL '+m)};
const read=p=>fs.readFileSync(path.join(root,p),'utf8');const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const baselineDoc=JSON.parse(read('scripts/NX_COLLAB_1_R3_DEPLOYED_BASELINE_SHA256.json'));const baseline=baselineDoc.files||{};
const allowedChanged=new Set([
 'public/admin/css/admin.css','public/admin/index.html','public/admin/js/app.js','public/admin/js/core/i18n.js','public/admin/js/core/state.js','public/admin/js/core/ui.js','public/admin/js/modules/client-project-support.js','public/admin/js/modules/client-projects.js',
 'public/css/project-portal.css','public/js/project-portal.js','public/project-portal.html',
 'src/core/project-realtime.js','src/modules/operations/client-project-files.js','src/modules/operations/client-project-support.js',
 'tests/nx-collab-1/ui-contract.mjs','tests/nx-collab-1/worker-integration.mjs'
]);
for(const [rel,h] of Object.entries(baseline)){
 const p=path.join(root,rel);if(!fs.existsSync(p)){fail('R3 Live baseline file missing: '+rel);continue}
 if(!allowedChanged.has(rel)&&sha(p)!==h)fail('R3 Live baseline changed outside R4 approved surface: '+rel);
}
if(!failed)pass('R3 Live baseline protected outside approved R4 surface');
const newExpected=new Set([
 'NX_COLLAB_1_UI_R4_FINAL_CHECK.md','NX_COLLAB_1_UI_R4_README.md','docs/NX_COLLAB_1_UI_R4_DESIGN_ARCHITECTURE.md',
 'scripts/APPLY_NX_COLLAB_1_UI_R4.ps1','scripts/NX_COLLAB_1_R3_DEPLOYED_BASELINE_SHA256.json','scripts/NX_COLLAB_1_UI_R4_BROWSER_GATE.mjs','scripts/NX_COLLAB_1_UI_R4_CHECK.mjs','scripts/NX_COLLAB_1_UI_R4_RELEASE_MANIFEST.json','scripts/RUN_NX_COLLAB_1_UI_R4_RELEASE.ps1',
 'tests/nx-collab-1-r4-admin/access-visual.html','tests/nx-collab-1-r4-admin/files-visual.html','tests/nx-collab-1-r4-admin/support-visual.html',
 'tests/nx-collab-1-r4-portal/closed-visual.html','tests/nx-collab-1-r4-portal/drawer-visual.html','tests/nx-collab-1-r4-portal/execution-visual.html','tests/nx-collab-1-r4-portal/overview-visual.html','tests/nx-collab-1-r4-portal/support-visual.html'
]);
const inventory=[];function walkInventory(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.wrangler','.r4-backup'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walkInventory(p);else inventory.push(path.relative(root,p).replaceAll('\\','/'))}}walkInventory(root);
const addedActual=new Set(inventory.filter(x=>!Object.hasOwn(baseline,x)));const missing=[...newExpected].filter(x=>!addedActual.has(x)),extra=[...addedActual].filter(x=>!newExpected.has(x));if(missing.length||extra.length)fail('R4 added-file inventory mismatch missing=['+missing.join(',')+'] extra=['+extra.join(',')+']');else pass('R4 added-file inventory exact ('+addedActual.size+')');
const migrations=fs.readdirSync(path.join(root,'migrations')).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();const expectedMigrations=['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql','0005_clients_hardening.sql','0006_clients_code_alignment.sql','0007_client_projects.sql','0008_client_project_execution.sql','0009_client_project_portal_support.sql','0010_client_project_collaboration.sql'];migrations.join('|')===expectedMigrations.join('|')?pass('migration inventory exact 0001..0010'):fail('migration inventory mismatch');
const migrationRel='migrations/0010_client_project_collaboration.sql';sha(path.join(root,migrationRel))===baseline[migrationRel]?pass('0010 byte-identical to deployed R3'):fail('0010 changed in UI R4');
const router=read('src/api-router.js');/method\s*===\s*['"]DELETE['"]/.test(router)?fail('HTTP DELETE route introduced'):pass('no HTTP DELETE route introduced');const routeCount=(router.match(/if\(method===/g)||[]).length;routeCount===89?pass('API route inventory unchanged (89 route guards)'):fail('API route inventory changed: '+routeCount);
const adminHtml=read('public/admin/index.html'),portal=read('public/project-portal.html'),portalJs=read('public/js/project-portal.js'),portalCss=read('public/css/project-portal.css'),adminCss=read('public/admin/css/admin.css'),adminSupport=read('public/admin/js/modules/client-project-support.js'),adminProjects=read('public/admin/js/modules/client-projects.js'),files=read('src/modules/operations/client-project-files.js'),support=read('src/modules/operations/client-project-support.js'),rt=read('src/core/project-realtime.js');
for(const html of [adminHtml,portal])if(!html.includes('<meta name="nexora-ui-release" content="NX-COLLAB-1-UI-R4">'))fail('R4 live asset marker missing');if(!failed)pass('R4 live asset markers present');
for(const token of ['projectWorkspaceLayer','project-workspace-layer','openProjectWorkspace','project-command-hero']){if(!(adminHtml+adminCss+adminProjects).includes(token))fail('Admin full Project Workspace contract missing: '+token)}
if(adminCss.includes('.project-workspace-layer{')&&adminCss.includes('position:fixed')&&adminCss.includes('inset:0'))pass('Admin Project Workspace is viewport layer');else fail('Admin Project Workspace can regress to narrow drawer');
if(!adminSupport.includes('clientAccessSection')||!adminSupport.includes('generated-project-link')||!adminSupport.includes('copyProjectLink'))fail('Admin Client Access link workflow missing');else pass('Admin Client Access generate/copy/revoke surface retained');
if(portal.includes('data-tab="access"')||portal.includes('وصول العميل')||portalJs.includes('clientAccess'))fail('Client Access leaked into Client Portal');else pass('Client Portal has no Client Access module');
if((portal.match(/data-tab="/g)||[]).length!==3)fail('Client Portal top-level IA must contain exactly 3 safe modules');else pass('Client Portal top-level IA exact: Overview / Execution / Tickets');
for(const id of ['portalTicketBack','portalClosedNewTicket','portalNewMessagesBtn','portalVoiceBtn','portalReplyFile'])if(!portal.includes(`id="${id}"`))fail('Client Portal behavior control missing: '+id);
if(!/grid-template-columns:minmax\((?:285|300|310)px,\.3[4-8]fr\) minmax\(0,\.6[2-6]fr\)/.test(portalCss))fail('Client Portal desktop ticket split contract missing');else pass('Client Portal ticket workspace split retained');
if(!portalCss.includes('.portal-ticket-workspace.is-detail')||!portalCss.includes('.portal-ticket-mobile-back'))fail('Client Portal mobile list/detail architecture missing');else pass('Client Portal mobile ticket navigation present');
if(portalJs.includes('location.reload('))fail('reload-based synchronization reintroduced');else pass('no reload-based synchronization');
for(const token of ['visibilitychange','new WebSocket(','startPolling','replyDrafts',"$('#portalNewMessagesBtn').hidden=false",'selected=created'])if(!portalJs.includes(token))fail('Client Portal realtime/draft contract missing: '+token);
if(files.includes('portalFileDto')&&files.includes('_source_message_id')&&support.includes('.map(a=>a.file)')&&support.includes('assigned_to:null'))pass('Client DTO deny-by-default file/assignment hardening present');else fail('Client DTO privacy hardening missing');
if(rt.includes('project_id:Number(projectId)'))fail('numeric project id leaked in realtime client payload');else pass('Realtime client event omits numeric Project id');
if(!support.includes("author_name:x.author_type==='admin'?'NEXORA'")||!support.includes("actor_name:x.actor_type==='admin'?'NEXORA'"))fail('Admin identity leaked into client ticket DTO');else pass('Client-facing admin identity normalized to NEXORA');
const dialogSources=[adminSupport,adminProjects,portalJs];if(dialogSources.some(x=>x.includes('window.confirm(')||x.includes('window.prompt(')||/\bprompt\s*\(/.test(x)))fail('native browser confirm/prompt reintroduced');else pass('no native browser confirm/prompt');
if(!/\.primary-btn\{[^}]*color:(?:white|#fff);/.test(adminCss))fail('Admin primary CTA white text regressed');else pass('Admin Primary CTA white-text retained');if(!portalCss.includes('.portal-primary')||!portalCss.includes('color:#fff'))fail('Portal primary CTA white text regressed');else pass('Portal Primary CTA white-text retained');
const iconSources=inventory.filter(x=>(x.startsWith('public/')||x.startsWith('src/'))&&/\.(?:js|mjs)$/.test(x)).map(x=>[x,read(x)]);for(const [rel,s] of iconSources){for(const pattern of ['esc(faIcon(','esc(detailIcon(','esc(executionStateIcon('])if(s.includes(pattern))fail('escaped Font Awesome rendering regression: '+rel+' -> '+pattern)}
if(!failed)pass('Font Awesome rendering regression scan');
const js=[];function walkJs(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.wrangler','.r4-backup'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walkJs(p);else if(/\.(?:js|mjs)$/.test(e.name))js.push(p)}}walkJs(path.join(root,'src'));walkJs(path.join(root,'public'));for(const p of js){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status!==0){fail('runtime JS syntax '+path.relative(root,p));break}}if(!failed)pass('runtime JavaScript syntax');
const htmlFiles=[];function walkHtml(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walkHtml(p);else if(e.name.endsWith('.html'))htmlFiles.push(p)}}walkHtml(path.join(root,'public'));for(const p of htmlFiles){const ids=[...fs.readFileSync(p,'utf8').matchAll(/\bid=["']([^"']+)/g)].map(m=>m[1]),seen=new Set();for(const id of ids){if(seen.has(id))fail('duplicate HTML id '+path.relative(root,p)+'#'+id);seen.add(id)}}if(!failed)pass('public HTML duplicate IDs');
const gates=['scripts/NX_DATA_5_CHECK.mjs','scripts/NX_COLLAB_1_FULL_SCHEMA_REGRESSION.mjs','tests/nx-collab-1/worker-integration.mjs','tests/nx-collab-1/ui-contract.mjs','tests/nx-core-2/worker-parity.mjs','tests/nx-ops-1/existing-admin-compat.mjs','scripts/NX_COLLAB_1_UI_R4_BROWSER_GATE.mjs'];
for(const rel of gates){const r=spawnSync(process.execPath,[path.join(root,rel)],{cwd:root,encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)fail('gate '+rel);else pass('gate '+rel)}
console.log('\nNX-COLLAB-1 UI R4 CHECK: '+(failed?'FAIL':'PASS'));process.exit(failed?1:0);
