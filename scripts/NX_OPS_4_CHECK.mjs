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

const baselineDoc=JSON.parse(read('scripts/NX_OPS_4_PROTECTED_BASELINE_SHA256.json'));
if(baselineDoc.baseline!=='NX-OPS-3-R6-FONTAWESOME-ICON-RENDERING-CLEAN')fail(`unexpected protected baseline identity: ${baselineDoc.baseline}`);
const baseline=baselineDoc.files||{};
const approvedChanges=new Set([
  'src/api-router.js',
  'src/modules/operations/clients.js',
  'src/modules/operations/client-projects.js',
  'src/modules/operations/client-project-execution.js',
  'public/admin/index.html',
  'public/admin/setup.html',
  'public/admin/css/admin.css',
  'public/admin/js/core/i18n.js',
  'public/admin/js/modules/client-projects.js'
]);
const expectedNew=new Set([
  'migrations/0009_client_project_portal_support.sql',
  'public/project-portal.html',
  'public/js/project-portal.js',
  'public/css/nexora-foundation.css',
  'public/css/project-portal.css',
  'public/admin/js/core/design-system.js',
  'public/admin/js/modules/client-project-support.js',
  'src/core/auth-client-portal.js',
  'src/modules/operations/client-project-support.js',
  'tests/nx-data-4/schema-proof.py',
  'tests/nx-ops-4/worker-integration.mjs',
  'tests/nx-ops-4/ui-contract.mjs',
  'scripts/NX_FULL_SCHEMA_REGRESSION.mjs',
  'scripts/NX_OPS_4_PROTECTED_BASELINE_SHA256.json',
  'scripts/NX_DATA_4_CHECK.mjs',
  'scripts/NX_OPS_4_CHECK.mjs',
  'scripts/APPLY_NX_OPS_4.ps1',
  'scripts/RUN_NX_OPS_4_RELEASE.ps1',
  'scripts/NX_OPS_4_RELEASE_MANIFEST.json',
  'docs/NX_DATA_4_PORTAL_SUPPORT_SCHEMA.md',
  'docs/NX_OPS_4_PORTAL_SUPPORT_FOUNDATION.md',
  'NX_DATA_4_FINAL_CHECK.md',
  'NX_OPS_4_FINAL_CHECK.md'
]);

let protectedOk=true;
for(const [rel,expected] of Object.entries(baseline)){
  if(!exists(rel)){fail(`R6 accepted baseline file missing: ${rel}`);protectedOk=false;continue;}
  if(approvedChanges.has(rel))continue;
  if(sha(rel)!==expected){fail(`unapproved R6 baseline change: ${rel}`);protectedOk=false;}
}
if(protectedOk){
  pass(`R6 Live baseline protected (${Object.keys(baseline).length} files; ${approvedChanges.size} explicitly reviewable changes)`);
  const publicNonAdmin=Object.keys(baseline).filter(x=>x.startsWith('public/')&&!x.startsWith('public/admin/'));
  let publicOk=true;
  for(const rel of publicNonAdmin){if(sha(rel)!==baseline[rel]){fail(`protected public/client-profile regression: ${rel}`);publicOk=false;}}
  if(publicOk&&publicNonAdmin.length===38)pass('accepted public website/client-profile assets byte-identical (38 files)');
  else if(publicNonAdmin.length!==38)fail(`unexpected protected public/client-profile inventory: ${publicNonAdmin.length}`);
}
for(const rel of approvedChanges)if(!exists(rel))fail(`approved NX-OPS-4 changed file missing: ${rel}`);

const current=[];
function collect(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(ent.name==='node_modules'||ent.name==='.wrangler')continue;const p=path.join(dir,ent.name);if(ent.isDirectory())collect(p);else if(ent.isFile())current.push(path.relative(root,p).split(path.sep).join('/'));}}
collect(root);
const extras=current.filter(rel=>!Object.prototype.hasOwnProperty.call(baseline,rel));
const unexpected=extras.filter(rel=>!expectedNew.has(rel));
const missing=[...expectedNew].filter(rel=>!extras.includes(rel));
if(unexpected.length)fail(`unexpected NX-OPS-4 files: ${unexpected.join(', ')}`);
if(missing.length)fail(`expected NX-OPS-4 files missing: ${missing.join(', ')}`);
if(!unexpected.length&&!missing.length)pass(`NX-OPS-4 added-file inventory exact (${expectedNew.size} files); runtime caches ignored`);

const manifestRel='scripts/NX_OPS_4_RELEASE_MANIFEST.json';
if(exists(manifestRel)){
  try{
    const manifest=JSON.parse(read(manifestRel));
    if(manifest.release!=='NX-OPS-4-R2-PORTAL-SUPPORT-FOUNDATION-CLEAN')fail(`release manifest identity mismatch: ${manifest.release}`);
    if(manifest.node_version!=='v22.23.2')fail(`release manifest Node mismatch: ${manifest.node_version}`);
    if(manifest.wrangler_version!=='4.129.1')fail(`release manifest Wrangler mismatch: ${manifest.wrangler_version}`);
    if(manifest.node_archive_sha256!=='1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97')fail('release manifest Node archive SHA mismatch');
    const entries=Array.isArray(manifest.files)?manifest.files:[];
    const paths=entries.map(x=>String(x?.path||''));
    const dup=paths.filter((x,i)=>paths.indexOf(x)!==i);
    if(dup.length)fail(`release manifest duplicate paths: ${[...new Set(dup)].join(', ')}`);
    if(paths.includes(manifestRel))fail('release manifest must not hash itself');
    if(paths.some(x=>!x||x.startsWith('/')||x.includes('..')||x.includes('\\')))fail('release manifest contains unsafe path');
    const expectedPaths=current.filter(x=>x!==manifestRel).sort();
    const actual=[...paths].sort();
    if(JSON.stringify(expectedPaths)!==JSON.stringify(actual)){
      const m=expectedPaths.filter(x=>!actual.includes(x));const e=actual.filter(x=>!expectedPaths.includes(x));
      fail(`release manifest inventory mismatch; missing=${m.join(', ')} extra=${e.join(', ')}`);
    }else{
      let hashesOk=true;
      for(const entry of entries){if(!/^[a-f0-9]{64}$/.test(String(entry.sha256||''))||sha(entry.path)!==entry.sha256){fail(`release manifest hash mismatch: ${entry.path}`);hashesOk=false;}}
      if(hashesOk)pass(`NX-OPS-4 clean release manifest exact (${entries.length} staged files)`);
    }
  }catch(err){fail(`release manifest validation failed: ${err?.message||err}`);}
}else fail('NX-OPS-4 release manifest missing');

for(const rel of ['scripts/APPLY_NX_OPS_4.ps1','scripts/RUN_NX_OPS_4_RELEASE.ps1']){
  const buf=fs.readFileSync(abs(rel));
  if([...buf].some(b=>b>0x7f))fail(`non-ASCII byte found in release-critical PowerShell script: ${rel}`);
}
if(!process.exitCode)pass('release-critical PowerShell scripts are ASCII-safe for Windows PowerShell 5.1');

// Windows Python may default to a legacy ANSI code page (for example cp1252).
// Every schema proof that reads UTF-8 SQL must therefore declare the encoding explicitly.
let pythonUtf8Ok=true;
for(const rel of [
  'tests/nx-data-1/schema-proof.py',
  'tests/nx-data-1-1/schema-proof.py',
  'tests/nx-data-1-2/schema-proof.py',
  'tests/nx-data-2/schema-proof.py',
  'tests/nx-data-3/schema-proof.py',
  'tests/nx-data-4/schema-proof.py'
]){
  const source=read(rel);
  if(/\.read_text\(\s*\)/.test(source)){
    fail(`Python schema proof uses platform-default text encoding: ${rel}`);
    pythonUtf8Ok=false;
  }
}
if(pythonUtf8Ok)pass('Python schema proofs use explicit UTF-8 text decoding (Windows code-page safe)');

const migrations=fs.readdirSync(abs('migrations')).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
const expectedMigrations=['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql','0005_clients_hardening.sql','0006_clients_code_alignment.sql','0007_client_projects.sql','0008_client_project_execution.sql','0009_client_project_portal_support.sql'];
if(JSON.stringify(migrations)!==JSON.stringify(expectedMigrations))fail(`migration inventory mismatch: ${migrations.join(', ')}`);else pass('migration inventory exact (0001..0009)');
let oldMigrationOk=true;
for(const f of expectedMigrations.slice(0,8)){const rel=`migrations/${f}`;if(!baseline[rel]||sha(rel)!==baseline[rel]){fail(`accepted migration changed: ${f}`);oldMigrationOk=false;}}
if(oldMigrationOk)pass('applied migrations 0001..0008 byte-identical');
const migration=read('migrations/0009_client_project_portal_support.sql');
const migrationExecutable=migration.split(/\r?\n/).map(line=>line.replace(/--.*$/,'').trim()).filter(Boolean);
const destructiveStatement=migrationExecutable.find(line=>/^(?:DROP|TRUNCATE|DELETE|UPDATE|INSERT|REPLACE)\b/i.test(line));
if(destructiveStatement)fail(`0009 contains destructive/data-mutation statement: ${destructiveStatement}`);else pass('0009 additive/forward-only SQL guard');
for(const frozen of ['status','type','priority','visibility','event_type','author_type','actor_type'])if(new RegExp(`CHECK\\s*\\(\\s*${frozen}\\b`,'i').test(migration))fail(`0009 freezes evolving catalog in DB CHECK: ${frozen}`);
for(const table of ['client_project_access_grants','client_portal_sessions','client_project_tickets','client_project_ticket_messages','client_project_ticket_events'])if(!new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\b`,'i').test(migration))fail(`0009 table missing: ${table}`);
for(const marker of ['token_hash TEXT NOT NULL UNIQUE','session_hash TEXT NOT NULL UNIQUE','csrf_hash TEXT NOT NULL','ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 0'])if(!migration.includes(marker))fail(`0009 contract missing: ${marker}`);
if(/\b(?:raw_token|session_token|csrf_token)\b/i.test(migration))fail('0009 stores raw portal credential material');
if(!process.exitCode)pass('Portal hash-only credentials + deny-by-default visibility schema contract');

const api=read('src/api-router.js');
if(/method==='DELETE'/.test(api))fail('generic HTTP DELETE route introduced');else pass('no HTTP DELETE route introduced');
const routes=[];
for(const m of api.matchAll(/method==='(GET|POST|PATCH|OPTIONS)'&&path==='([^']+)'/g))routes.push(`${m[1]} ${m[2]}`);
for(const m of api.matchAll(/match\(path,'([^']+)'\);if\(method==='(GET|POST|PATCH)'/g))routes.push(`${m[2]} ${m[1]}`);
const inventory=['OPTIONS *',...routes];
const requiredRoutes=[
  'POST /api/v1/client-portal/exchange','GET /api/v1/client-portal/session','POST /api/v1/client-portal/logout','GET /api/v1/client-portal/project','GET /api/v1/client-portal/tickets','POST /api/v1/client-portal/tickets','GET /api/v1/client-portal/tickets/:publicId','POST /api/v1/client-portal/tickets/:publicId/messages',
  'GET /api/v1/admin/client-projects/:id/support/config','GET /api/v1/admin/client-projects/:id/portal-access','POST /api/v1/admin/client-projects/:id/portal-access/generate','POST /api/v1/admin/client-projects/:id/portal-access/:grantId/revoke','GET /api/v1/admin/client-projects/:id/tickets','POST /api/v1/admin/client-projects/:id/tickets','GET /api/v1/admin/client-projects/:id/tickets/:ticketId','POST /api/v1/admin/client-projects/:id/tickets/:ticketId/update','POST /api/v1/admin/client-projects/:id/tickets/:ticketId/messages','POST /api/v1/admin/client-projects/:id/tickets/:ticketId/lifecycle'
];
if(inventory.length!==79)fail(`API route inventory count mismatch: ${inventory.length} (expected 79)`);
for(const r of requiredRoutes)if(!inventory.includes(r))fail(`NX-OPS-4 route missing: ${r}`);
if(inventory.length===79&&requiredRoutes.every(r=>inventory.includes(r)))pass('API route inventory exact (79; 18 Portal/Support routes)');

const support=read('src/modules/operations/client-project-support.js');
const portalAuth=read('src/core/auth-client-portal.js');
for(const marker of ['TICKET_TRANSITIONS','validateTransition','validateAssignee','can_submit_tickets','can_comment_tickets','client_visible=1','visibility=\'client\''])if(!support.includes(marker))fail(`Support service contract missing: ${marker}`);
if(!support.includes('portal_url:`${base}#token=')||support.includes('?token='))fail('Project access URL must use fragment token only');
if(!support.includes('token_hash')||!support.includes('sessionHash')||!portalAuth.includes('session_hash=?'))fail('Portal hashed credential lookup contract missing');
if(!portalAuth.includes('HttpOnly; Secure; SameSite=Strict'))fail('Portal cookie security attributes missing');
if(!support.includes("visibility:'client'")||!support.includes("visibility='client'"))fail('Client-facing message/event visibility filter missing');
for(const forbidden of ['agreed_amount_minor','audit_logs','context_json']){
  const dtoSlice=support.slice(support.indexOf('async function portalProjectDto'),support.indexOf('function portalTicketDto'));
  if(dtoSlice.includes(forbidden))fail(`client-safe Project DTO leaks forbidden field: ${forbidden}`);
}
if(/context:\{[^}]*\btoken\s*:/s.test(support))fail('raw portal token appears in audit context');
if(!support.includes("UPDATE client_portal_sessions SET revoked_at=CURRENT_TIMESTAMP")||!read('src/modules/operations/clients.js').includes('client_portal_sessions')||!read('src/modules/operations/client-projects.js').includes('client_portal_sessions'))fail('Portal session revocation lifecycle contract incomplete');
if(!process.exitCode)pass('Portal/Ticket security, permissions, deny-by-default DTO and revocation contracts present');

const foundation=read('public/css/nexora-foundation.css');
for(const marker of ['--nx-color-primary','--nx-status-success','--nx-status-progress','--nx-status-warning','--nx-status-danger','--nx-radius-md','--nx-motion-normal'])if(!foundation.includes(marker))fail(`NEXORA design token missing: ${marker}`);
const design=read('public/admin/js/core/design-system.js');
for(const marker of ["id:'tickets'","id:'clientAccess'",'TICKET_STATUS_VISUAL','TICKET_PRIORITY_VISUAL'])if(!design.includes(marker))fail(`Design-system registry contract missing: ${marker}`);
const adminIndex=read('public/admin/index.html'),setup=read('public/admin/setup.html'),portalHtml=read('public/project-portal.html'),portalJs=read('public/js/project-portal.js'),portalCss=read('public/css/project-portal.css');
if(!adminIndex.includes('../css/nexora-foundation.css')||!setup.includes('../css/nexora-foundation.css'))fail('Admin Foundation token stylesheet not loaded');
if(!adminIndex.includes('font-awesome/7.3.1')||!portalHtml.includes('font-awesome/7.3.1'))fail('Font Awesome 7.3.1 standard missing from Admin/Portal');
if(!portalHtml.includes('css/nexora-foundation.css'))fail('Client Project Portal does not consume NEXORA design foundation');
if(!portalCss.includes('html[data-theme="light"]')||!portalCss.includes('@media'))fail('Portal Dark/Light or responsive visual contract missing');
if(!portalJs.includes("location.hash")||portalJs.includes('location.search')||portalJs.includes("searchParams.get('token')"))fail('Portal fragment-token lifecycle regression');
if(!portalJs.includes("credentials:'include'")||!portalJs.includes("X-CSRF-Token"))fail('Portal session/CSRF browser contract missing');
const allAdminJs=fs.readdirSync(abs('public/admin/js/modules')).filter(x=>x.endsWith('.js')).map(x=>read(`public/admin/js/modules/${x}`)).join('\n')+read('public/admin/js/core/ui.js');
if(/window\.confirm\s*\(/.test(allAdminJs+portalJs))fail('native window.confirm introduced');
if(/esc\s*\(\s*(?:faIcon|detailIcon|executionStateIcon)\s*\(/.test(allAdminJs))fail('trusted Font Awesome markup is escaped and would render as literal HTML');
if(!process.exitCode)pass('Extensible NEXORA Design System + Font Awesome + responsive Portal contracts present');

const execution=read('src/modules/operations/client-project-execution.js');
for(const marker of ['client_visible','booleanFlag'])if(!execution.includes(marker))fail(`Execution client visibility service contract missing: ${marker}`);
const projectUi=read('public/admin/js/modules/client-projects.js');
for(const marker of ['clientVisibleToggle','client_visible','projectWorkspaceNav','loadProjectSupport','loadProjectAccess'])if(!projectUi.includes(marker))fail(`Project Workspace Portal/Support contract missing: ${marker}`);
if(!process.exitCode)pass('Project Workspace client-visible execution + Tickets + Client Access integration present');

const htmlFiles=[],cssFiles=[],jsFiles=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(ent.isFile()){if(p.endsWith('.html'))htmlFiles.push(p);if(p.endsWith('.css'))cssFiles.push(p);if(p.endsWith('.js'))jsFiles.push(p);}}}
walk(abs('public'));walk(abs('src'));
let htmlOk=true;for(const f of htmlFiles){const txt=fs.readFileSync(f,'utf8'),ids=[...txt.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),dup=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];if(dup.length){fail(`duplicate HTML ids in ${path.relative(root,f)}: ${dup.join(',')}`);htmlOk=false;}}if(htmlOk)pass(`HTML duplicate IDs (${htmlFiles.length} pages)`);
function stripCss(s){return s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'');}
let cssOk=true;for(const f of cssFiles){const s=stripCss(fs.readFileSync(f,'utf8'));let d=0;for(const c of s){if(c==='{')d++;else if(c==='}')d--;if(d<0)break;}if(d!==0){fail(`CSS brace imbalance: ${path.relative(root,f)}`);cssOk=false;}}if(cssOk)pass(`CSS structure (${cssFiles.length} files)`);
let jsOk=true;for(const f of jsFiles){try{execFileSync(process.execPath,['--check',f],{stdio:'ignore'});}catch{fail(`JavaScript syntax: ${path.relative(root,f)}`);jsOk=false;}}if(jsOk)pass(`runtime JavaScript syntax (${jsFiles.length} files)`);
const adminCss=read('public/admin/css/admin.css');if(!/\.primary-btn\{[^}]*color:(?:white|#fff);/.test(adminCss))fail('Primary CTA white-text contract regressed');else pass('accepted Primary CTA white-text UX retained');

const env={...process.env,NODE_NO_WARNINGS:'1'};
const run=(label,rel)=>{try{execFileSync(process.execPath,[abs(rel)],{stdio:'inherit',env});pass(label);}catch{fail(label);}};
run('NX-DATA-4 schema gate','scripts/NX_DATA_4_CHECK.mjs');
run('public/unauthenticated Worker parity 21/21','tests/nx-core-2/worker-parity.mjs');
run('existing authenticated Admin compatibility 10/10','tests/nx-ops-1/existing-admin-compat.mjs');
run('full-schema historical regression through 0009','scripts/NX_FULL_SCHEMA_REGRESSION.mjs');
run('NX-OPS-4 Portal/Support integration','tests/nx-ops-4/worker-integration.mjs');
run('NX-OPS-4 Portal/Support UI contract','tests/nx-ops-4/ui-contract.mjs');

if(process.exitCode){console.error('\nNX-OPS-4 CHECK: FAIL');process.exit(process.exitCode);}
console.log('\nNX-OPS-4 CHECK: PASS');
