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
const fail=msg=>{console.error('FAIL',msg);process.exitCode=1};
const pass=msg=>console.log('PASS',msg);
const exists=rel=>fs.existsSync(abs(rel));

// 1) The accepted Clients-closed + Primary CTA baseline is immutable in this schema-only gate.
const manifest=JSON.parse(read('scripts/NX_DATA_2_PROTECTED_BASELINE_SHA256.json'));
let protectedOk=true;
for(const [rel,expected] of Object.entries(manifest)){
  if(!exists(rel)){fail(`protected accepted baseline file missing: ${rel}`);protectedOk=false;continue;}
  if(sha(rel)!==expected){fail(`protected accepted baseline file changed: ${rel}`);protectedOk=false;}
}
if(protectedOk){
  pass(`accepted baseline byte-identical (${Object.keys(manifest).length})`);
  const publicCount=Object.keys(manifest).filter(x=>x.startsWith('public/')&&!x.startsWith('public/admin/')).length;
  if(publicCount!==38)fail(`unexpected accepted public non-admin inventory: ${publicCount}`);
  else pass('public website/client-profile assets byte-identical (38 files)');
}
const allowedAdditions=new Set([
  'migrations/0007_client_projects.sql',
  'scripts/NX_DATA_2_CHECK.mjs',
  'scripts/NX_DATA_2_PROTECTED_BASELINE_SHA256.json',
  'scripts/APPLY_NX_DATA_2.ps1',
  'tests/nx-data-2/schema-proof.py',
  'docs/NX_DATA_2_CLIENT_PROJECTS.md',
  'NX_DATA_2_FINAL_CHECK.md'
]);
const currentFiles=[];
function collectFiles(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(ent.name==='node_modules'||ent.name==='.wrangler')continue;const p=path.join(dir,ent.name);if(ent.isDirectory())collectFiles(p);else if(ent.isFile())currentFiles.push(path.relative(root,p).split(path.sep).join('/'));}}
collectFiles(root);
const extras=currentFiles.filter(rel=>!Object.prototype.hasOwnProperty.call(manifest,rel));
const unexpectedExtras=extras.filter(rel=>!allowedAdditions.has(rel));
const missingAdditions=[...allowedAdditions].filter(rel=>!extras.includes(rel));
if(unexpectedExtras.length)fail(`unexpected files added in NX-DATA-2: ${unexpectedExtras.join(', ')}`);
if(missingAdditions.length)fail(`expected NX-DATA-2 additions missing: ${missingAdditions.join(', ')}`);
if(!unexpectedExtras.length&&!missingAdditions.length)pass('NX-DATA-2 added-file inventory exact (7 files)');

// 2) Migration chain and immutable previously-applied bytes.
const migrations=fs.readdirSync(abs('migrations')).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
const expectedMigrations=[
  '0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql',
  '0005_clients_hardening.sql','0006_clients_code_alignment.sql','0007_client_projects.sql'
];
if(JSON.stringify(migrations)!==JSON.stringify(expectedMigrations))fail(`migration inventory mismatch: ${migrations.join(', ')}`);
else pass('migration inventory exact (0001..0007)');
const locked={
  '0001_schema.sql':'f15d52ce1d8cc85927b80e6a4e66702de03c6a5f0cdc4808fd45ed3303f2071c',
  '0002_seed.sql':'67aadca2061e63129479739e1546865ce337cc52a88bb0cfbe771eb6d5d804cc',
  '0003_inquiry_locale.sql':'67058b0525f0ed1029a9dd89f3dd1df23ae2e99b9c173c6f4c2ebd70c835f113',
  '0004_clients_core.sql':'4e202a5b9bf9d558f4ed4b0b1593991885fde15b31af976ae14b92ea1be1b533',
  '0005_clients_hardening.sql':'24f1cf87f56fc031848c275f3288ebc62784d019e9fa4d4d992e7987d7c43f8f',
  '0006_clients_code_alignment.sql':'497ee9e3572035abf77586e17786978716f0660cf9aacd0fc64b7404fb03a71e'
};
let lockedOk=true;
for(const [file,expected] of Object.entries(locked)){
  if(sha(`migrations/${file}`)!==expected){fail(`accepted migration changed: ${file}`);lockedOk=false;}
}
if(lockedOk)pass('accepted migrations 0001..0006 byte-identical');

// 3) 0007 is additive-only and strictly scoped to the internal Client Projects domain.
const sql=read('migrations/0007_client_projects.sql');
const requiredTables=['client_projects','client_project_services','client_project_members','inquiry_project_links'];
for(const table of requiredTables){
  if(!new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\b`,'i').test(sql))fail(`0007 missing table: ${table}`);
}
const futureTables=['project_milestones','project_tasks','client_project_notes','operation_events','portal_access_grants','client_portal_sessions','service_tickets','ticket_messages','quotes','quote_items','invoices','invoice_items','payments','file_assets','private_files'];
for(const table of futureTables){
  if(new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\b`,'i').test(sql))fail(`future table introduced early: ${table}`);
}
const executable=sql.split(/\r?\n/).map(line=>line.replace(/--.*$/,'').trim()).filter(Boolean);
const nonAdditive=executable.find(line=>/^(DROP|TRUNCATE|DELETE|UPDATE|INSERT|REPLACE|ALTER)\b/i.test(line));
if(nonAdditive)fail(`0007 contains non-additive statement: ${nonAdditive}`);else pass('0007 additive-only SQL guard');
if(/\bALTER\s+TABLE\s+projects\b/i.test(sql)||/\bUPDATE\s+projects\b/i.test(sql)||/\bREFERENCES\s+projects\s*\(/i.test(sql))fail('0007 crosses into public Portfolio projects domain');
else pass('Portfolio projects domain remains isolated');
if(/CHECK\s*\(\s*(?:status|priority|progress_mode)\b/i.test(sql))fail('0007 freezes evolving workflow/catalog values in DB CHECK constraints');
else pass('status/priority/progress-mode catalogs remain service-authoritative');
for(const contract of [
  'public_id TEXT NOT NULL UNIQUE','project_code TEXT UNIQUE','client_id INTEGER NOT NULL',
  "status TEXT NOT NULL DEFAULT 'planning'","priority TEXT NOT NULL DEFAULT 'normal'",
  "progress_mode TEXT NOT NULL DEFAULT 'manual'",'agreed_amount_minor INTEGER',
  'portal_visible INTEGER NOT NULL DEFAULT 0','PRIMARY KEY (project_inquiry_id, client_project_id)'
]) if(!sql.includes(contract))fail(`0007 missing schema contract: ${contract}`);
for(const fk of [
  /FOREIGN KEY \(client_id\) REFERENCES clients\(id\) ON DELETE RESTRICT/i,
  /FOREIGN KEY \(client_project_id\) REFERENCES client_projects\(id\) ON DELETE RESTRICT/i,
  /FOREIGN KEY \(project_inquiry_id\) REFERENCES project_inquiries\(id\) ON DELETE RESTRICT/i,
  /FOREIGN KEY \(service_id\) REFERENCES services\(id\) ON DELETE RESTRICT/i,
  /FOREIGN KEY \(updated_by_admin_id\) REFERENCES admin_users\(id\) ON DELETE SET NULL/i
]) if(!fk.test(sql))fail(`0007 missing FK contract: ${fk}`);
if(!process.exitCode)pass('Client Projects schema contracts present');

// 4) Schema-only means no Client Projects runtime, API, navigation or placeholder UI is exposed early.
const apiSource=read('src/api-router.js');
for(const forbidden of ['/api/v1/admin/client-projects','/api/v1/admin/tasks','/api/v1/admin/milestones','/api/v1/admin/tickets','/api/v1/admin/quotes','/api/v1/admin/invoices','/api/v1/client/portal']){
  if(apiSource.includes(forbidden))fail(`future route introduced in schema-only gate: ${forbidden}`);
}
const adminIndex=read('public/admin/index.html');
for(const marker of ['view-client-projects','view-tasks','view-milestones','view-tickets','view-quotes','view-invoices','view-portal']){
  if(adminIndex.includes(marker))fail(`future Admin UI introduced in schema-only gate: ${marker}`);
}
if(!process.exitCode)pass('no NX-OPS-2/UI/API exposure introduced early');

// Existing guarded Client deletion discovers new FKs dynamically, so Client Projects automatically become blockers once rows exist.
const clientsRuntime=read('src/modules/operations/clients.js');
for(const marker of ['sqlite_master', 'PRAGMA foreign_key_list', "String(fk.table||'')!=='clients'", 'CLIENT_DELETE_BLOCKED']){
  if(!clientsRuntime.includes(marker))fail(`dynamic Client delete blocker contract missing: ${marker}`);
}
if(!process.exitCode)pass('existing guarded Client delete will discover client_projects FK dynamically');

// 5) Structural frontend/runtime sanity remains unchanged.
const htmlFiles=[],cssFiles=[],jsFiles=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(ent.isFile()){if(p.endsWith('.html'))htmlFiles.push(p);if(p.endsWith('.css'))cssFiles.push(p);if(p.endsWith('.js'))jsFiles.push(p);}}}
walk(abs('public'));walk(abs('src'));
let htmlOk=true;
for(const f of htmlFiles){const text=fs.readFileSync(f,'utf8'),ids=[...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),dup=[...new Set(ids.filter((x,i)=>ids.indexOf(x)!==i))];if(dup.length){fail(`duplicate HTML ids in ${path.relative(root,f)}: ${dup.join(',')}`);htmlOk=false;}}
if(htmlOk)pass(`HTML duplicate IDs (${htmlFiles.length} pages)`);
function stripCss(s){return s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'');}
let cssOk=true;
for(const f of cssFiles){const s=stripCss(fs.readFileSync(f,'utf8'));let depth=0;for(const ch of s){if(ch==='{')depth++;else if(ch==='}')depth--;if(depth<0)break;}if(depth!==0){fail(`CSS brace imbalance: ${path.relative(root,f)}`);cssOk=false;}}
if(cssOk)pass(`CSS structure (${cssFiles.length} files)`);
let jsOk=true;
for(const f of jsFiles){try{execFileSync(process.execPath,['--check',f],{stdio:'ignore'});}catch{fail(`JavaScript syntax: ${path.relative(root,f)}`);jsOk=false;}}
if(jsOk)pass(`runtime JavaScript syntax (${jsFiles.length} files)`);

// CTA/notification UX accepted bytes are protected, plus readable contract checks.
const ds=read('public/css/design-system.css'),profile=read('public/css/client-profile.css'),adminCss=read('public/admin/css/admin.css');
if(!/\.btn--primary\{color:#fff;/.test(ds))fail('public primary CTA white-text contract regressed');
if(!/\.primary-btn\{[^}]*color:#fff;/.test(profile))fail('client-profile primary CTA white-text contract regressed');
if(!/\.primary-btn\{[^}]*color:(?:white|#fff);/.test(adminCss))fail('Admin primary CTA white-text contract regressed');
if(!process.exitCode)pass('accepted Primary CTA white-text UX retained');

// 6) D1/SQLite relational proof.
function runPythonProof(){
  const attempts=process.platform==='win32'?[['python',[]],['py',['-3']]]:[['python3',[]],['python',[]]];
  for(const [cmd,args] of attempts){
    if(spawnSync(cmd,[...args,'--version'],{stdio:'ignore'}).status!==0)continue;
    execFileSync(cmd,[...args,abs('tests/nx-data-2/schema-proof.py')],{stdio:'inherit'});
    return;
  }
  throw new Error('Python 3 was not found for the D1-compatible schema proof.');
}
try{runPythonProof();pass('NX-DATA-2 SQLite/D1-compatible schema proof');}catch(err){fail(`NX-DATA-2 schema proof: ${err.message}`);}

// 7) Accepted runtime regressions. These tests intentionally load the accepted 0001..0006 runtime baseline.
const env={...process.env,NODE_NO_WARNINGS:'1'};
const run=(label,rel)=>{try{execFileSync(process.execPath,[abs(rel)],{stdio:'inherit',env});pass(label);}catch{fail(label);}};
run('public/unauthenticated Worker parity 21/21','tests/nx-core-2/worker-parity.mjs');
run('existing authenticated Admin compatibility 10/10','tests/nx-ops-1/existing-admin-compat.mjs');
run('NX-OPS-1.1A Clients hardening integration regression','tests/nx-ops-1-1a/worker-integration.mjs');
run('NX-OPS-1.1A UI regression','tests/nx-ops-1-1a/ui-contract.mjs');
run('NX-OPS-1.1B secure profile integration regression','tests/nx-ops-1-1b/worker-integration.mjs');
run('NX-OPS-1.1B UI regression','tests/nx-ops-1-1b/ui-contract.mjs');

if(process.exitCode){console.error('\nNX-DATA-2 CHECK: FAIL');process.exit(process.exitCode);}
console.log('\nNX-DATA-2 CHECK: PASS');
