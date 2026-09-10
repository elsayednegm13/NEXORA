'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const abs=rel=>path.join(root,...rel.split('/'));
const read=rel=>fs.readFileSync(abs(rel),'utf8');
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(abs(rel))).digest('hex');
const exists=rel=>fs.existsSync(abs(rel));
const fail=msg=>{console.error('FAIL',msg);process.exitCode=1};
const pass=msg=>console.log('PASS',msg);

// Protect the deployed NX-OPS-3 R4 package. R5 is a reviewed Admin icon-system and Project Execution visual refinement only.
const r4Baseline=JSON.parse(read('scripts/NX_OPS_3_R4_DEPLOYED_BASELINE_SHA256.json'));
const r5AllowedChanges=new Set([
  'public/admin/index.html',
  'public/admin/setup.html',
  'public/admin/css/admin.css',
  'public/admin/js/core/ui.js',
  'public/admin/js/modules/client-projects.js',
  'public/admin/js/modules/clients.js',
  'public/admin/js/modules/inquiries.js',
  'public/admin/js/modules/portfolio-projects.js',
  'public/admin/js/modules/services.js',
  'tests/nx-ops-3/ui-contract.mjs',
  'scripts/NX_OPS_3_CHECK.mjs',
  'scripts/RUN_NX_OPS_3_RELEASE.ps1',
  'scripts/NX_OPS_3_RELEASE_MANIFEST.json',
  'NX_OPS_3_FINAL_CHECK.md',
  'IMPORTANT.txt'
]);
let r4ProtectedOk=true;
for(const [rel,expected] of Object.entries(r4Baseline)){
  if(!exists(rel)){fail(`NX-OPS-3 R4 deployed file missing: ${rel}`);r4ProtectedOk=false;continue;}
  if(r5AllowedChanges.has(rel))continue;
  if(sha(rel)!==expected){fail(`unapproved NX-OPS-3 R4 baseline change: ${rel}`);r4ProtectedOk=false;}
}
if(r4ProtectedOk)pass(`NX-OPS-3 R4 deployed baseline protected (${Object.keys(r4Baseline).length} files; ${r5AllowedChanges.size} explicitly reviewable R5 changes)`);

// Protect the exact R5 Live-accepted package. Only the reviewed NX-DATA-3/NX-OPS-3 surface may change.
const baseline=JSON.parse(read('scripts/NX_OPS_3_PROTECTED_BASELINE_SHA256.json'));
const approvedChanges=new Set([
  'src/api-router.js',
  'src/modules/operations/client-projects.js',
  'src/modules/operations/clients.js',
  'public/admin/index.html',
  'public/admin/css/admin.css',
  'public/admin/js/app.js',
  'public/admin/js/core/i18n.js',
  'public/admin/js/core/state.js',
  'public/admin/js/modules/client-projects.js',
  'public/admin/js/modules/clients.js',
  'public/admin/setup.html',
  'public/admin/js/core/ui.js',
  'public/admin/js/modules/inquiries.js',
  'public/admin/js/modules/portfolio-projects.js',
  'public/admin/js/modules/services.js',
  'IMPORTANT.txt'
]);
let protectedOk=true;
for(const [rel,expected] of Object.entries(baseline)){
  if(!exists(rel)){fail(`R5 accepted baseline file missing: ${rel}`);protectedOk=false;continue;}
  if(approvedChanges.has(rel))continue;
  if(sha(rel)!==expected){fail(`unapproved R5 baseline change: ${rel}`);protectedOk=false;}
}
if(protectedOk){
  pass(`R5 Live baseline protected (${Object.keys(baseline).length} files; ${approvedChanges.size} explicitly reviewable changes)`);
  const publicNonAdmin=Object.keys(baseline).filter(x=>x.startsWith('public/')&&!x.startsWith('public/admin/'));
  let publicOk=true;for(const rel of publicNonAdmin){if(sha(rel)!==baseline[rel]){fail(`public/client-profile regression: ${rel}`);publicOk=false;}}
  if(publicOk&&publicNonAdmin.length===38)pass('public website/client-profile assets byte-identical (38 files)');
  else if(publicNonAdmin.length!==38)fail(`unexpected protected public/client-profile inventory: ${publicNonAdmin.length}`);
}
for(const rel of approvedChanges)if(!exists(rel))fail(`approved NX-OPS-3 changed file missing: ${rel}`);

const expectedNew=new Set([
  'migrations/0008_client_project_execution.sql',
  'src/modules/operations/client-project-execution.js',
  'tests/nx-data-3/schema-proof.py',
  'tests/nx-ops-3/worker-integration.mjs',
  'tests/nx-ops-3/ui-contract.mjs',
  'scripts/NX_DATA_3_CHECK.mjs',
  'scripts/NX_OPS_3_CHECK.mjs',
  'scripts/NX_OPS_3_PROTECTED_BASELINE_SHA256.json',
  'scripts/APPLY_NX_OPS_3.ps1',
  'scripts/RUN_NX_OPS_3_RELEASE.ps1',
  'scripts/NX_OPS_3_RELEASE_MANIFEST.json',
  'scripts/NX_OPS_3_R2_DEPLOYED_BASELINE_SHA256.json',
  'scripts/NX_OPS_3_R3_DEPLOYED_BASELINE_SHA256.json',
  'scripts/NX_OPS_3_R4_DEPLOYED_BASELINE_SHA256.json',
  'public/admin/js/core/icons.js',
  'docs/NX_DATA_3_PROJECT_EXECUTION_SCHEMA.md',
  'docs/NX_OPS_3_PROJECT_EXECUTION.md',
  'NX_DATA_3_FINAL_CHECK.md',
  'NX_OPS_3_FINAL_CHECK.md'
]);
const current=[];
function collect(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(ent.name==='node_modules'||ent.name==='.wrangler')continue;const p=path.join(dir,ent.name);if(ent.isDirectory())collect(p);else if(ent.isFile())current.push(path.relative(root,p).split(path.sep).join('/'));}}
collect(root);
const extras=current.filter(rel=>!Object.prototype.hasOwnProperty.call(baseline,rel));
const unexpected=extras.filter(rel=>!expectedNew.has(rel));
const missing=[...expectedNew].filter(rel=>!extras.includes(rel));
if(unexpected.length)fail(`unexpected NX-OPS-3 files: ${unexpected.join(', ')}`);
if(missing.length)fail(`expected NX-OPS-3 files missing: ${missing.join(', ')}`);
if(!unexpected.length&&!missing.length)pass(`NX-OPS-3 added-file inventory exact (${expectedNew.size} files); runtime caches ignored`);


// Release manifest must describe the exact clean-stage payload (everything except the manifest itself).
const manifestRel='scripts/NX_OPS_3_RELEASE_MANIFEST.json';
try{
  const manifest=JSON.parse(read(manifestRel));
  const expectedRelease='NX-OPS-3-R6-FONTAWESOME-ICON-RENDERING-CLEAN';
  if(manifest.release!==expectedRelease)fail(`release manifest identity mismatch: ${manifest.release}`);
  if(manifest.node_version!=='v22.23.2')fail(`release manifest Node version mismatch: ${manifest.node_version}`);
  if(manifest.wrangler_version!=='4.129.1')fail(`release manifest Wrangler version mismatch: ${manifest.wrangler_version}`);
  if(manifest.node_archive_sha256!=='1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97')fail('release manifest Node archive SHA mismatch');
  const entries=Array.isArray(manifest.files)?manifest.files:[];
  const entryPaths=entries.map(x=>String(x?.path||''));
  const duplicates=entryPaths.filter((x,i)=>entryPaths.indexOf(x)!==i);
  if(duplicates.length)fail(`release manifest duplicate paths: ${[...new Set(duplicates)].join(', ')}`);
  if(entryPaths.includes(manifestRel))fail('release manifest must not hash itself');
  if(entryPaths.some(x=>!x||x.startsWith('/')||x.includes('..')||x.includes('\\')))fail('release manifest contains unsafe/non-canonical path');
  const expectedPaths=current.filter(x=>x!==manifestRel).sort();
  const actualPaths=[...entryPaths].sort();
  if(JSON.stringify(expectedPaths)!==JSON.stringify(actualPaths)){
    const missingPaths=expectedPaths.filter(x=>!actualPaths.includes(x));
    const extraPaths=actualPaths.filter(x=>!expectedPaths.includes(x));
    fail(`release manifest inventory mismatch; missing=${missingPaths.join(', ')} extra=${extraPaths.join(', ')}`);
  } else {
    let hashesOk=true;
    for(const entry of entries){
      if(!/^[a-f0-9]{64}$/.test(String(entry.sha256||''))||sha(entry.path)!==entry.sha256){fail(`release manifest hash mismatch: ${entry.path}`);hashesOk=false;}
    }
    if(hashesOk)pass(`NX-OPS-3 clean release manifest exact (${entries.length} staged files)`);
  }
}catch(err){fail(`release manifest validation failed: ${err?.message||err}`);}

// Windows PowerShell 5.1 compatibility: release-critical entry scripts must be ASCII-only.
for(const rel of ['scripts/APPLY_NX_OPS_3.ps1','scripts/RUN_NX_OPS_3_RELEASE.ps1']){
  const buf=fs.readFileSync(abs(rel));
  const bad=[...buf].filter(b=>b>0x7f);
  if(bad.length)fail(`non-ASCII byte found in release-critical PowerShell script: ${rel}`);
}
if(!process.exitCode)pass('release-critical PowerShell scripts are ASCII-safe for Windows PowerShell 5.1');

// Migration chain and schema gate.
try{execFileSync(process.execPath,[abs('scripts/NX_DATA_3_CHECK.mjs')],{stdio:'inherit',env:{...process.env,NODE_NO_WARNINGS:'1'}});pass('NX-DATA-3 execution schema gate');}catch{fail('NX-DATA-3 execution schema gate');}

// Exact API boundary: accepted 51 routes + 10 execution routes = 61 including OPTIONS.
const api=read('src/api-router.js');
if(/method==='DELETE'/.test(api))fail('generic HTTP DELETE route introduced');else pass('no HTTP DELETE route introduced');
const exact=[];
for(const m of api.matchAll(/method==='(GET|POST|PATCH|OPTIONS)'&&path==='([^']+)'/g))exact.push(`${m[1]} ${m[2]}`);
for(const m of api.matchAll(/match\(path,'([^']+)'\);if\(method==='(GET|POST|PATCH)'/g))exact.push(`${m[2]} ${m[1]}`);
const actual=['OPTIONS *',...exact];
const executionRoutes=[
  'GET /api/v1/admin/client-projects/:id/execution/summary',
  'POST /api/v1/admin/client-projects/:id/execution/progress-mode',
  'GET /api/v1/admin/client-projects/:id/milestones',
  'POST /api/v1/admin/client-projects/:id/milestones',
  'POST /api/v1/admin/client-projects/:id/milestones/:milestoneId/update',
  'POST /api/v1/admin/client-projects/:id/milestones/:milestoneId/lifecycle',
  'GET /api/v1/admin/client-projects/:id/tasks',
  'POST /api/v1/admin/client-projects/:id/tasks',
  'POST /api/v1/admin/client-projects/:id/tasks/:taskId/update',
  'POST /api/v1/admin/client-projects/:id/tasks/:taskId/lifecycle'
];
if(actual.length!==61)fail(`API route inventory count mismatch: ${actual.length} (expected 61)`);
for(const route of executionRoutes)if(!actual.includes(route))fail(`execution API route missing: ${route}`);
if(actual.length===61&&executionRoutes.every(x=>actual.includes(x)))pass('API route inventory exact (61; 10 Project Execution routes)');
for(const forbidden of ['/api/v1/admin/tickets','/api/v1/admin/quotes','/api/v1/admin/invoices','/api/v1/admin/payments','/api/v1/admin/time-entries','/api/v1/client/portal'])if(api.includes(forbidden))fail(`future route introduced early: ${forbidden}`);

// Service authority/security contracts.
const execution=read('src/modules/operations/client-project-execution.js');
for(const marker of [
  "MILESTONE_STATUSES=['pending','in_progress','completed','cancelled']",
  "TASK_STATUSES=['todo','in_progress','blocked','done','cancelled']",
  "TASK_PRIORITIES=['low','normal','high','urgent']",
  "EXECUTION_PROGRESS_MODES=['manual','calculated']",
  'const MILESTONE_TRANSITIONS=', 'const TASK_TRANSITIONS=',
  "publicId('cpm')", "publicId('cpt')",
  'assertSameOrigin(request)', 'requireCsrf(request,env,auth)',
  'validateMilestoneForProject', 'validateAssignees',
  "CLIENT_PROJECT_TASK_ASSIGNEE_INVALID",
  "CLIENT_PROJECT_TASK_MILESTONE_INVALID",
  "action==='archive'", "action==='restore'",
  "project.progress_mode==='calculated'"
]) if(!execution.includes(marker))fail(`execution runtime contract missing: ${marker}`);
if(/DELETE\s+FROM\s+(?:client_project_tasks|client_project_milestones)\b/i.test(execution))fail('Task/Milestone hard-delete SQL introduced');else pass('Task/Milestone lifecycle is archive/restore only');
if(/window\.confirm\s*\(/.test(read('public/admin/js/modules/client-projects.js')))fail('native window.confirm introduced');else pass('themed confirmation standard retained');
for(const marker of ['task-assignee-card','task-assignee-person','task-assignee-name-row','task-assignee-lead','task-assignee-input','data-task-assignee-card','data-task-assignee'])if(!read('public/admin/js/modules/client-projects.js').includes(marker))fail(`Task assignee UI refinement missing: ${marker}`);
for(const marker of ['.task-assignee-card{','.task-assignee-person{','.task-assignee-name-row{','.task-assignee-lead{','.task-assignee-input{','html[dir="rtl"] .task-assignee-card.is-selected','html[data-theme="light"] .task-assignee-card'])if(!read('public/admin/css/admin.css').includes(marker))fail(`Task assignee responsive/theme CSS missing: ${marker}`);
if(!process.exitCode)pass('Task assignee row-card UI contract retained across RTL/LTR and Dark/Light');
for(const marker of ['task-stage-group','task-visual-card','execution-status-pill','taskStageGroups(tasks,milestones)','taskStageDistribution(tasks)','taskStageCard(group,p,milestones,config,index)','taskVisualState(task)','milestoneVisualState(m)'])if(!read('public/admin/js/modules/client-projects.js').includes(marker))fail(`Project Execution visual-board refinement missing: ${marker}`);
for(const marker of ['.task-stage-group{','.task-stage-head{','.task-visual-card{','.task-visual-summary{','.execution-status-pill{','.execution-stat-done{','.execution-stat-overdue{'])if(!read('public/admin/css/admin.css').includes(marker))fail(`Project Execution visual-board CSS missing: ${marker}`);
if(!read('public/admin/js/modules/client-projects.js').includes("newTaskOpen:false"))fail('new-task form does not collapse after successful save');
if(!process.exitCode)pass('Project Execution stage/task visual board and post-save collapse contract retained');

const adminHtml=read('public/admin/index.html');
const setupHtml=read('public/admin/setup.html');
const iconCore=read('public/admin/js/core/icons.js');
for(const page of [adminHtml,setupHtml])if(!page.includes('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.1/js/all.min.js'))fail('pinned Font Awesome 7.3.1 Admin runtime missing');
for(const marker of ['fa-solid','fa-diagram-project','fa-magnifying-glass'])if(!adminHtml.includes(marker))fail(`Admin shell Font Awesome marker missing: ${marker}`);
for(const marker of ['export function faIcon','export function executionStateIcon','circle-check','arrows-rotate','triangle-exclamation','ban','box-archive'])if(!iconCore.includes(marker))fail(`Font Awesome helper contract missing: ${marker}`);
for(const marker of ['task-stage-status-visual','task-stage-status-map','task-meta-chip','task-card-actions'])if(!read('public/admin/js/modules/client-projects.js').includes(marker))fail(`refined execution visual marker missing: ${marker}`);
for(const marker of ['.nexora-fa{','.task-stage-status-map{','.task-stage-status-segment.status-done','.task-stage-status-segment.status-overdue','.task-stage-cards{display:grid;grid-template-columns:repeat(2','.task-visual-card[open]{grid-column:1/-1','.task-meta-chip{'])if(!read('public/admin/css/admin.css').includes(marker))fail(`Font Awesome/refined visual CSS marker missing: ${marker}`);
if(!process.exitCode)pass('Font Awesome Admin icon standard + compact execution status board contract');

// R6 regression gate: static icon-helper markup must never be passed through HTML escaping.
// faIcon/detailIcon/executionStateIcon return controlled static markup; data values remain escaped separately.
const adminJsRoot=abs('public/admin/js');
const escapedIconMarkup=[];
(function scanEscapedIcons(dir){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory())scanEscapedIcons(p);
    else if(ent.isFile()&&p.endsWith('.js')){
      const text=fs.readFileSync(p,'utf8');
      if(/esc\s*\(\s*(?:faIcon|detailIcon|executionStateIcon)\s*\(/.test(text)) escapedIconMarkup.push(path.relative(root,p).split(path.sep).join('/'));
    }
  }
})(adminJsRoot);
if(escapedIconMarkup.length)fail(`Font Awesome helper markup is HTML-escaped: ${escapedIconMarkup.join(', ')}`);
const inquiryUiR6=read('public/admin/js/modules/inquiries.js');
if(!inquiryUiR6.includes('${detailIcon(kind)}')||inquiryUiR6.includes('${esc(detailIcon(kind))}'))fail('Inquiry detail icon rendering regression remains');
if(!process.exitCode)pass('Font Awesome icon markup renders safely without literal HTML leakage');



// Client detail -> projects discovery/navigation contract.
const clients=read('src/modules/operations/clients.js');
const clientUi=read('public/admin/js/modules/clients.js');
const projectUi=read('public/admin/js/modules/client-projects.js');
for(const marker of ['client_projects','client_project_count','effective_progress_percent'])if(!clients.includes(marker))fail(`Client detail project summary contract missing: ${marker}`);
for(const marker of ['clientProjectsSection(c)','data-open-client-project','data-open-client-projects'])if(!clientUi.includes(marker))fail(`Client drawer project-navigation contract missing: ${marker}`);
for(const marker of ['clientProjectClientScope','client_id','clientProjectScopeBar'])if(!(read('public/admin/js/core/state.js')+'\n'+projectUi+'\n'+read('public/admin/index.html')).includes(marker))fail(`Client scoped-project view contract missing: ${marker}`);
if(!process.exitCode)pass('Client detail exposes direct-project and client-scoped project navigation');

// Structural frontend/runtime sanity.
const htmlFiles=[],cssFiles=[],jsFiles=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(ent.isFile()){if(p.endsWith('.html'))htmlFiles.push(p);if(p.endsWith('.css'))cssFiles.push(p);if(p.endsWith('.js'))jsFiles.push(p);}}}
walk(abs('public'));walk(abs('src'));
let htmlOk=true;for(const f of htmlFiles){const text=fs.readFileSync(f,'utf8'),ids=[...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),dup=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];if(dup.length){fail(`duplicate HTML ids in ${path.relative(root,f)}: ${dup.join(',')}`);htmlOk=false;}}if(htmlOk)pass(`HTML duplicate IDs (${htmlFiles.length} pages)`);
function stripCss(s){return s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'');}
let cssOk=true;for(const f of cssFiles){const s=stripCss(fs.readFileSync(f,'utf8'));let depth=0;for(const ch of s){if(ch==='{')depth++;else if(ch==='}')depth--;if(depth<0)break;}if(depth!==0){fail(`CSS brace imbalance: ${path.relative(root,f)}`);cssOk=false;}}if(cssOk)pass(`CSS structure (${cssFiles.length} files)`);
let jsOk=true;for(const f of jsFiles){try{execFileSync(process.execPath,['--check',f],{stdio:'ignore'});}catch{fail(`JavaScript syntax: ${path.relative(root,f)}`);jsOk=false;}}if(jsOk)pass(`runtime JavaScript syntax (${jsFiles.length} files)`);
const adminCss=read('public/admin/css/admin.css');if(!/\.primary-btn\{[^}]*color:(?:white|#fff);/.test(adminCss))fail('Admin primary CTA white-text contract regressed');else pass('accepted Primary CTA white-text UX retained');

const env={...process.env,NODE_NO_WARNINGS:'1'};
const run=(label,rel)=>{try{execFileSync(process.execPath,[abs(rel)],{stdio:'inherit',env});pass(label);}catch{fail(label);}};
const fullMigrationArray="['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql','0005_clients_hardening.sql','0006_clients_code_alignment.sql','0007_client_projects.sql','0008_client_project_execution.sql']";
function runIntegrationOnCurrentSchema(label,rel){
  const source=read(rel);const patched=source.replace(/for\(const f of \[[^\]]+\]\)/,`for(const f of ${fullMigrationArray})`);
  if(patched===source){fail(`${label}: migration fixture list was not found`);return;}
  const dir=path.dirname(abs(rel)),tmp=path.join(dir,`.nx-ops-3-compat-${process.pid}-${crypto.randomBytes(4).toString('hex')}.mjs`);
  try{fs.writeFileSync(tmp,patched);execFileSync(process.execPath,[tmp],{stdio:'inherit',env});pass(label);}catch{fail(label);}finally{try{fs.unlinkSync(tmp)}catch{}}
}
run('public/unauthenticated Worker parity 21/21','tests/nx-core-2/worker-parity.mjs');
run('existing authenticated Admin compatibility 10/10','tests/nx-ops-1/existing-admin-compat.mjs');
runIntegrationOnCurrentSchema('NX-OPS-1.1A Clients hardening integration regression','tests/nx-ops-1-1a/worker-integration.mjs');
run('NX-OPS-1.1A UI regression','tests/nx-ops-1-1a/ui-contract.mjs');
runIntegrationOnCurrentSchema('NX-OPS-1.1B secure profile integration regression','tests/nx-ops-1-1b/worker-integration.mjs');
run('NX-OPS-1.1B UI regression','tests/nx-ops-1-1b/ui-contract.mjs');
runIntegrationOnCurrentSchema('NX-OPS-2 Client Project workspace integration regression','tests/nx-ops-2/worker-integration.mjs');
run('NX-OPS-2 Client Project workspace UI regression','tests/nx-ops-2/ui-contract.mjs');
run('NX-OPS-3 Project Execution integration','tests/nx-ops-3/worker-integration.mjs');
run('NX-OPS-3 Project Execution UI contract','tests/nx-ops-3/ui-contract.mjs');

if(process.exitCode){console.error('\nNX-OPS-3 CHECK: FAIL');process.exit(process.exitCode);}
console.log('\nNX-OPS-3 CHECK: PASS');
