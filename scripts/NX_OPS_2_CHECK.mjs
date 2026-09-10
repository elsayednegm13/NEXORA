'use strict';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const abs=rel=>path.join(root,...rel.split('/'));
const read=rel=>fs.readFileSync(abs(rel),'utf8');
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(abs(rel))).digest('hex');
const exists=rel=>fs.existsSync(abs(rel));
const fail=msg=>{console.error('FAIL',msg);process.exitCode=1};
const pass=msg=>console.log('PASS',msg);

// 1) Protect the accepted NX-DATA-2 live-closed baseline. Only the explicit NX-OPS-2 surface may change.
const manifest=JSON.parse(read('scripts/NX_OPS_2_PROTECTED_BASELINE_SHA256.json'));
const approvedChanges=new Set([
  'src/api-router.js',
  'src/modules/operations/clients.js',
  'public/admin/index.html',
  'public/admin/css/admin.css',
  'public/admin/js/app.js',
  'public/admin/js/core/i18n.js',
  'public/admin/js/core/router.js',
  'public/admin/js/core/state.js',
  'public/admin/js/core/ui.js',
  'public/admin/js/modules/clients.js',
  'scripts/NX_DATA_2_CHECK.mjs',
  'scripts/APPLY_NX_DATA_2.ps1'
]);
let protectedOk=true;
for(const [rel,expected] of Object.entries(manifest)){
  if(!exists(rel)){fail(`accepted baseline file missing: ${rel}`);protectedOk=false;continue;}
  if(approvedChanges.has(rel))continue;
  if(sha(rel)!==expected){fail(`unapproved accepted-baseline change: ${rel}`);protectedOk=false;}
}
if(protectedOk){
  pass(`accepted NX-DATA-2 baseline protected (${Object.keys(manifest).length} files; ${approvedChanges.size} explicitly reviewable changes)`);
  const publicNonAdmin=Object.keys(manifest).filter(x=>x.startsWith('public/')&&!x.startsWith('public/admin/'));
  let publicOk=true;for(const rel of publicNonAdmin){if(sha(rel)!==manifest[rel]){fail(`public/client-profile regression: ${rel}`);publicOk=false;}}
  if(publicOk&&publicNonAdmin.length===38)pass('public website/client-profile assets byte-identical (38 files)');
  else if(publicNonAdmin.length!==38)fail(`unexpected protected public/client-profile inventory: ${publicNonAdmin.length}`);
}
for(const rel of approvedChanges)if(!exists(rel))fail(`approved NX-OPS-2 changed file missing: ${rel}`);

const expectedNew=new Set([
  'src/modules/operations/client-projects.js',
  'public/admin/js/modules/client-projects.js',
  'tests/nx-ops-2/worker-integration.mjs',
  'tests/nx-ops-2/ui-contract.mjs',
  'scripts/NX_OPS_2_CHECK.mjs',
  'scripts/NX_OPS_2_PROTECTED_BASELINE_SHA256.json',
  'scripts/APPLY_NX_OPS_2.ps1',
  'docs/NX_OPS_2_CLIENT_PROJECT_WORKSPACE.md',
  'NX_OPS_2_FINAL_CHECK.md',
  'scripts/RUN_NX_OPS_2_RELEASE.ps1',
  'scripts/NX_OPS_2_RELEASE_MANIFEST.json',
  'scripts/D1_JSON_GUARD.mjs'
]);
const current=[];
function collect(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(ent.name==='node_modules'||ent.name==='.wrangler')continue;const p=path.join(dir,ent.name);if(ent.isDirectory())collect(p);else if(ent.isFile())current.push(path.relative(root,p).split(path.sep).join('/'));}}
collect(root);
const extras=current.filter(rel=>!Object.prototype.hasOwnProperty.call(manifest,rel));
const unexpected=extras.filter(rel=>!expectedNew.has(rel));
const missing=[...expectedNew].filter(rel=>!extras.includes(rel));
if(unexpected.length)fail(`unexpected NX-OPS-2 files: ${unexpected.join(', ')}`);
if(missing.length)fail(`expected NX-OPS-2 files missing: ${missing.join(', ')}`);
if(!unexpected.length&&!missing.length)pass(`NX-OPS-2 added-file inventory exact (${expectedNew.size} files); runtime caches ignored`);

// 2) Migration chain is already live through 0007 and is immutable here.
const migrations=fs.readdirSync(abs('migrations')).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
const expectedMigrations=['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql','0005_clients_hardening.sql','0006_clients_code_alignment.sql','0007_client_projects.sql'];
if(JSON.stringify(migrations)!==JSON.stringify(expectedMigrations))fail(`migration inventory mismatch: ${migrations.join(', ')}`);else pass('migration inventory exact (0001..0007; NX-OPS-2 adds no migration)');
const locked={
  '0001_schema.sql':'f15d52ce1d8cc85927b80e6a4e66702de03c6a5f0cdc4808fd45ed3303f2071c',
  '0002_seed.sql':'67aadca2061e63129479739e1546865ce337cc52a88bb0cfbe771eb6d5d804cc',
  '0003_inquiry_locale.sql':'67058b0525f0ed1029a9dd89f3dd1df23ae2e99b9c173c6f4c2ebd70c835f113',
  '0004_clients_core.sql':'4e202a5b9bf9d558f4ed4b0b1593991885fde15b31af976ae14b92ea1be1b533',
  '0005_clients_hardening.sql':'24f1cf87f56fc031848c275f3288ebc62784d019e9fa4d4d992e7987d7c43f8f',
  '0006_clients_code_alignment.sql':'497ee9e3572035abf77586e17786978716f0660cf9aacd0fc64b7404fb03a71e',
  '0007_client_projects.sql':'83128b483a62fe5d629aa24a996afcc7b6250996ddd2a1c42174c70a3d951bf6'
};
let migrationOk=true;for(const [f,h] of Object.entries(locked)){if(sha(`migrations/${f}`)!==h){fail(`applied migration changed: ${f}`);migrationOk=false;}}if(migrationOk)pass('applied migrations 0001..0007 byte-identical');

// 3) Exact API boundary: 42 accepted routes + 9 Client Projects routes = 51 including OPTIONS.
const api=read('src/api-router.js');
if(/method==='DELETE'/.test(api))fail('generic HTTP DELETE route introduced');else pass('no HTTP DELETE route introduced');
const exact=[];
for(const m of api.matchAll(/method==='(GET|POST|PATCH|OPTIONS)'&&path==='([^']+)'/g))exact.push(`${m[1]} ${m[2]}`);
for(const m of api.matchAll(/match\(path,'([^']+)'\);if\(method==='(GET|POST|PATCH)'/g))exact.push(`${m[2]} ${m[1]}`);
const expectedRoutes=['OPTIONS *','GET /api/v1/health','GET /api/v1/health/db','GET /api/v1/services','GET /api/v1/services/:slug','GET /api/v1/projects','GET /api/v1/projects/:slug','GET /api/v1/project-inquiries/config','POST /api/v1/project-inquiries','POST /api/v1/client-profile/resolve','POST /api/v1/client-profile/complete','GET /api/v1/admin/setup/status','POST /api/v1/admin/setup','POST /api/v1/admin/auth/login','GET /api/v1/admin/auth/me','POST /api/v1/admin/auth/logout','GET /api/v1/admin/dashboard','GET /api/v1/admin/inquiries','GET /api/v1/admin/inquiries/:id','POST /api/v1/admin/inquiries/:id/update','PATCH /api/v1/admin/inquiries/:id','POST /api/v1/admin/inquiries/:id/convert-client','GET /api/v1/admin/clients/config','GET /api/v1/admin/clients','POST /api/v1/admin/clients','GET /api/v1/admin/clients/:id','POST /api/v1/admin/clients/:id/update','PATCH /api/v1/admin/clients/:id','POST /api/v1/admin/clients/:id/lifecycle','POST /api/v1/admin/clients/:id/delete','GET /api/v1/admin/clients/:id/profile-completion','POST /api/v1/admin/clients/:id/profile-completion/generate','POST /api/v1/admin/clients/:id/profile-completion/revoke','POST /api/v1/admin/clients/:id/contacts','POST /api/v1/admin/clients/:id/contacts/:contactId/update','PATCH /api/v1/admin/clients/:id/contacts/:contactId','GET /api/v1/admin/client-projects/config','GET /api/v1/admin/client-projects','POST /api/v1/admin/client-projects','GET /api/v1/admin/client-projects/:id','POST /api/v1/admin/client-projects/:id/update','PATCH /api/v1/admin/client-projects/:id','POST /api/v1/admin/client-projects/:id/lifecycle','GET /api/v1/admin/client-projects/:id/inquiry-options','POST /api/v1/admin/client-projects/:id/inquiries/link','GET /api/v1/admin/projects','POST /api/v1/admin/projects/:id/update','PATCH /api/v1/admin/projects/:id','GET /api/v1/admin/services','POST /api/v1/admin/services/:id/update','PATCH /api/v1/admin/services/:id'];
const actual=['OPTIONS *',...exact].sort(),expected=[...expectedRoutes].sort();
if(JSON.stringify(actual)!==JSON.stringify(expected))fail(`API route inventory mismatch (${actual.length})\n${actual.join('\n')}`);else pass(`API route inventory exact (${expected.length})`);
for(const forbidden of ['/api/v1/admin/tasks','/api/v1/admin/milestones','/api/v1/admin/tickets','/api/v1/admin/quotes','/api/v1/admin/invoices','/api/v1/admin/payments','/api/v1/client/portal'])if(api.includes(forbidden))fail(`future route introduced early: ${forbidden}`);

// 4) Service-side project authority/security contracts.
const project=read('src/modules/operations/client-projects.js');
const requiredMarkers=[
  "CLIENT_PROJECT_STATUSES=['planning','active','on_hold','completed','cancelled']",
  "CLIENT_PROJECT_PRIORITIES=['low','normal','high','urgent']",
  "CLIENT_PROJECT_PROGRESS_MODES=['manual']",
  'const PAGE_SIZE=50',
  "const PROJECT_STATUS_TRANSITIONS=",
  "function publicId(){return `cpr_${crypto.randomUUID()",
  "project_code='PRJ-' || printf('%03d',id)",
  "'planning'",
  "'manual'",
  'portal_visible',
  'moneyMinor(value)',
  'Number.isSafeInteger(minor)',
  'assertSameOrigin(request)',
  'requireCsrf(request,env,auth)',
  "throw new ApiError('CLIENT_PROJECT_ARCHIVED'",
  "action==='archive'",
  "action==='restore'",
  'already_linked:true',
  'CLIENT_PROJECT_INQUIRY_CLIENT_MISMATCH'
];
for(const marker of requiredMarkers)if(!project.includes(marker))fail(`Client Project runtime contract missing: ${marker}`);
if(/DELETE\s+FROM\s+client_projects\b/i.test(project))fail('Client Project hard-delete SQL introduced');else pass('Client Project lifecycle is archive/restore only');
if(/\bUPDATE\s+client_projects\s+SET[^;]*client_id\s*=/is.test(project))fail('Client reassignment exposed after Client Project creation');else pass('Client ownership immutable after creation');
if(!/agreed_amount_minor/.test(project)||!/^\s*if\(!\/\^\\d/m.test(project) && !project.includes("/^\\d{1,13}(?:\\.\\d{1,2})?$/"))fail('server money parser contract missing');
else pass('agreed amount parsed server-side into integer minor units');
if(!project.includes("portal_visible,created_by_admin_id")||!project.includes("?,?,0,?,?"))fail('portal visibility default-zero server-authority marker missing');
else pass('Client Projects do not grant Portal access');

// 5) Admin/UI contracts and no placeholder future modules.
const admin=read('public/admin/index.html'),app=read('public/admin/js/app.js'),router=read('public/admin/js/core/router.js'),state=read('public/admin/js/core/state.js'),ui=read('public/admin/js/modules/client-projects.js'),i18n=read('public/admin/js/core/i18n.js'),css=read('public/admin/css/admin.css');
for(const marker of ['operationsGroup','data-view="clientProjects"','id="view-client-projects"','clientProjectSearch','clientProjectStatusFilter','clientProjectPriorityFilter','addClientProjectBtn','clientProjectsBody','loadMoreClientProjects'])if(!admin.includes(marker))fail(`Client Projects Admin shell marker missing: ${marker}`);
for(const marker of ['clientProjects','activeClientProject'])if(!state.includes(marker))fail(`Client Projects state marker missing: ${marker}`);
for(const marker of ['clientProjects','OPERATIONS / CLIENT PROJECTS'])if(!router.includes(marker))fail(`Client Projects router marker missing: ${marker}`);
for(const marker of ['loadClientProjects','openNewClientProject'])if(!app.includes(marker))fail(`Client Projects app wiring missing: ${marker}`);
for(const marker of ['project_code','agreed_amount','services','members','inquiry','confirmDialog','toast('])if(!ui.includes(marker))fail(`Client Projects UI contract missing: ${marker}`);
for(const marker of ['projectStatusPlanning','priorityNormal','clientProjects','deleteBlockedRelations'])if(!i18n.includes(marker))fail(`Client Projects i18n marker missing: ${marker}`);
if(!/\.project-status/.test(css)||!/\.project-progress/.test(css))fail('Client Projects visual contracts missing');else pass('Client Projects responsive visual contracts present');
for(const forbidden of ['view-tasks','view-milestones','view-tickets','view-quotes','view-invoices','view-payments','view-portal'])if(admin.includes(forbidden))fail(`future Admin view introduced early: ${forbidden}`);
if(/window\.confirm\s*\(/.test(ui))fail('native window.confirm introduced in Client Projects UI');else pass('themed confirmation retained; no window.confirm');
const technicalToastTerms=['foreign key','sqlite_sequence','autoincrement','migration','database sequence','preserving ids','preserving codes'];
for(const term of technicalToastTerms)if(ui.toLowerCase().includes(term))fail(`technical implementation wording leaked into Client Projects UI: ${term}`);
if(/\.primary-btn\{[^}]*color:(?:white|#fff);/.test(css))pass('Primary CTA white-text UX retained');else fail('Primary CTA white-text contract regressed');

// 6) Cross-domain Client hard-delete guard discovers Client Projects and UI surfaces generic relation blocker.
const clientRuntime=read('src/modules/operations/clients.js'),clientUi=read('public/admin/js/modules/clients.js');
for(const marker of ["FROM client_projects WHERE client_id=?",'delete_eligibility={can_delete:knownBlockers.length===0'])if(!clientRuntime.includes(marker))fail(`Client hard-delete relational blocker missing: ${marker}`);
for(const marker of ["delete_eligibility?.can_delete===false","t('deleteBlockedRelations')"])if(!clientUi.includes(marker))fail(`Client delete UX blocker missing: ${marker}`);
if(!process.exitCode)pass('Client hard-delete guard respects Client Project relations');

// 7) Historical tooling hardening promised after NX-DATA-2 live closeout.
const data2Check=read('scripts/NX_DATA_2_CHECK.mjs'),data2Apply=read('scripts/APPLY_NX_DATA_2.ps1');
if(!data2Check.includes("ent.name==='.wrangler'"))fail('NX-DATA-2 gate still treats .wrangler runtime cache as source');else pass('.wrangler runtime cache ignored by engineering inventory');
if(!data2Apply.includes("PSObject.Properties['results']"))fail('NX-DATA-2 empty foreign_key_check parser hardening missing');else pass('empty foreign_key_check output handled safely');

// R5 release tooling: keep isolated Node/Wrangler, per-table probes, and parse D1 JSON outside PowerShell.
const ops2Apply=read('scripts/APPLY_NX_OPS_2.ps1'),ops2Runner=read('scripts/RUN_NX_OPS_2_RELEASE.ps1'),d1Guard=read('scripts/D1_JSON_GUARD.mjs');
for(const marker of ["$ExpectedNodeVersion = 'v22.23.2'",'$env:NEXORA_NODE_EXE','PASS pinned Node runtime'])if(!ops2Apply.includes(marker))fail(`NX-OPS-2 R5 apply runtime marker missing: ${marker}`);
for(const marker of ["$ExpectedNodeVersion = 'v22.23.2'","$ExpectedNodeArchiveSha256 = '1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97'","$NodeArchiveUrl = 'https://nodejs.org/download/release/v22.23.2/node-v22.23.2-win-x64.zip'",'Invoke-WebRequest -Uri $NodeArchiveUrl','PASS isolated Node runtime','wrangler-$ExpectedWranglerVersion-node22'])if(!ops2Runner.includes(marker))fail(`NX-OPS-2 R5 runner marker missing: ${marker}`);
for(const marker of ["$CountTables = @(",'function Get-RemoteCountSnapshot',"SELECT COUNT(*) AS rows_count FROM $table;","Get-RemoteCountSnapshot -Phase 'pre-deploy'","Get-RemoteCountSnapshot -Phase 'post-deploy'",'Invoke-D1JsonGuard'])if(!ops2Apply.includes(marker))fail(`NX-OPS-2 R5 D1 count probe marker missing: ${marker}`);
for(const marker of ["const [mode, filePath]", "mode === 'count'", "mode === 'fk-empty'", 'expected exactly one rows_count value'])if(!d1Guard.includes(marker))fail(`NX-OPS-2 R5 D1 JSON guard marker missing: ${marker}`);
if(/UNION ALL SELECT 'client_profile_tokens'[\s\S]*UNION ALL SELECT 'inquiry_project_links'/.test(ops2Apply))fail('NX-OPS-2 R5 still contains the rejected wide compound count query');
if(/ConvertFrom-Json[\s\S]{0,400}rows_count/.test(ops2Apply))fail('NX-OPS-2 R5 still parses D1 count rows through PowerShell ConvertFrom-Json');
if(!ops2Runner.includes("NX-OPS-2-R5"))fail('NX-OPS-2 R5 release manifest identity marker missing');
if(!process.exitCode)pass('R5 release tooling pins Node 22/Wrangler and uses a dedicated D1 JSON guard');

// 8) Structural sanity.
const htmlFiles=[],cssFiles=[],jsFiles=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(ent.name==='node_modules'||ent.name==='.wrangler')continue;const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(ent.isFile()){if(p.endsWith('.html'))htmlFiles.push(p);if(p.endsWith('.css'))cssFiles.push(p);if(p.endsWith('.js'))jsFiles.push(p);}}}
walk(abs('public'));walk(abs('src'));
let htmlOk=true;for(const f of htmlFiles){const text=fs.readFileSync(f,'utf8'),ids=[...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),dup=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];if(dup.length){fail(`duplicate HTML ids in ${path.relative(root,f)}: ${dup.join(',')}`);htmlOk=false;}}if(htmlOk)pass(`HTML duplicate IDs (${htmlFiles.length} pages)`);
function stripCss(s){return s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'');}
let cssOk=true;for(const f of cssFiles){const s=stripCss(fs.readFileSync(f,'utf8'));let depth=0;for(const ch of s){if(ch==='{')depth++;else if(ch==='}')depth--;if(depth<0)break;}if(depth!==0){fail(`CSS brace imbalance: ${path.relative(root,f)}`);cssOk=false;}}if(cssOk)pass(`CSS structure (${cssFiles.length} files)`);
let jsOk=true;for(const f of jsFiles){try{execFileSync(process.execPath,['--check',f],{stdio:'ignore'});}catch{fail(`JavaScript syntax: ${path.relative(root,f)}`);jsOk=false;}}if(jsOk)pass(`runtime JavaScript syntax (${jsFiles.length} files)`);

// 9) Schema + accepted runtime regressions + focused NX-OPS-2 tests.
function runPython(label,rel){const attempts=process.platform==='win32'?[['python',[]],['py',['-3']]]:[['python3',[]],['python',[]]];for(const [cmd,args] of attempts){if(spawnSync(cmd,[...args,'--version'],{stdio:'ignore'}).status!==0)continue;try{execFileSync(cmd,[...args,abs(rel)],{stdio:'inherit'});pass(label);return}catch{fail(label);return}}fail(`${label}: Python 3 unavailable`)}
const env={...process.env,NODE_NO_WARNINGS:'1'};
const run=(label,rel)=>{try{execFileSync(process.execPath,[abs(rel)],{stdio:'inherit',env});pass(label);}catch{fail(label);}};
runPython('NX-DATA-2 SQLite/D1-compatible schema proof','tests/nx-data-2/schema-proof.py');
run('public/unauthenticated Worker parity 21/21','tests/nx-core-2/worker-parity.mjs');
run('existing authenticated Admin compatibility 10/10','tests/nx-ops-1/existing-admin-compat.mjs');
run('NX-OPS-1.1A Clients hardening integration regression','tests/nx-ops-1-1a/worker-integration.mjs');
run('NX-OPS-1.1A UI regression','tests/nx-ops-1-1a/ui-contract.mjs');
run('NX-OPS-1.1B secure profile integration regression','tests/nx-ops-1-1b/worker-integration.mjs');
run('NX-OPS-1.1B UI regression','tests/nx-ops-1-1b/ui-contract.mjs');
run('NX-OPS-2 Client Project workspace integration','tests/nx-ops-2/worker-integration.mjs');
run('NX-OPS-2 Client Project workspace UI contract','tests/nx-ops-2/ui-contract.mjs');

if(process.exitCode){console.error('\nNX-OPS-2 CHECK: FAIL');process.exit(process.exitCode);}
console.log('\nNX-OPS-2 CHECK: PASS');
