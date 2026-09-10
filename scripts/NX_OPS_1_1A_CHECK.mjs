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

// 1) Freeze the accepted NX-DATA-1.1 baseline outside this deliberately narrow runtime/UI change surface.
const approvedChanges=new Set([
  'src/api-router.js',
  'src/modules/operations/clients.js',
  'public/admin/js/modules/clients.js',
  'public/admin/js/modules/inquiries.js',
  'public/admin/js/core/ui.js',
  'public/admin/js/core/i18n.js',
  'public/admin/css/admin.css'
]);
const manifest=JSON.parse(read('scripts/NX_OPS_1_1A_PROTECTED_BASELINE_SHA256.json'));
let protectedOk=true,protectedCount=0;
for(const [rel,expected] of Object.entries(manifest)){
  if(approvedChanges.has(rel))continue;protectedCount++;
  if(!exists(rel)){fail(`protected NX-DATA-1.1 file missing: ${rel}`);protectedOk=false;continue}
  if(sha(rel)!==expected){fail(`protected NX-DATA-1.1 file changed outside approved surface: ${rel}`);protectedOk=false}
}
if(protectedOk){pass(`NX-DATA-1.1 protected files byte-identical outside approved surface (${protectedCount})`);const publicCount=Object.keys(manifest).filter(x=>x.startsWith('public/')&&!x.startsWith('public/admin/')).length;if(publicCount!==35)fail(`unexpected public baseline count ${publicCount}`);else pass('public website byte-identical (35 files)')}
for(const rel of approvedChanges)if(!exists(rel))fail(`approved change file missing: ${rel}`);

// 2) Live migration chain is immutable through accepted 0005; 0006 is the forward-only owner correction.
const migrations=fs.readdirSync(abs('migrations')).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
const expectedMigrations=['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql','0005_clients_hardening.sql','0006_clients_code_alignment.sql'];
if(JSON.stringify(migrations)!==JSON.stringify(expectedMigrations))fail(`migration inventory mismatch: ${migrations.join(', ')}`);else pass('migration inventory exact (0001..0006 only)');
const migrationHashes={
  '0001_schema.sql':'f15d52ce1d8cc85927b80e6a4e66702de03c6a5f0cdc4808fd45ed3303f2071c',
  '0002_seed.sql':'67aadca2061e63129479739e1546865ce337cc52a88bb0cfbe771eb6d5d804cc',
  '0003_inquiry_locale.sql':'67058b0525f0ed1029a9dd89f3dd1df23ae2e99b9c173c6f4c2ebd70c835f113',
  '0004_clients_core.sql':'4e202a5b9bf9d558f4ed4b0b1593991885fde15b31af976ae14b92ea1be1b533',
  '0005_clients_hardening.sql':'24f1cf87f56fc031848c275f3288ebc62784d019e9fa4d4d992e7987d7c43f8f'
};
let migrationsOk=true;for(const [f,h] of Object.entries(migrationHashes)){if(sha(`migrations/${f}`)!==h){fail(`accepted migration hash changed: ${f}`);migrationsOk=false}}if(migrationsOk)pass('applied migrations 0001..0005 byte-identical');
const m6=read('migrations/0006_clients_code_alignment.sql');if(!m6.includes("client_code = 'CU-' || printf('%03d', id)"))fail('0006 Client Code alignment missing');else pass('0006 forward-only CU-{id} correction present');

// 3) Scope boundaries: no project-management/portal runtime leaked in.
const apiSource=read('src/api-router.js');
for(const forbidden of ['/api/v1/admin/client-projects','/api/v1/admin/tasks','/api/v1/admin/milestones','/api/v1/admin/tickets','/api/v1/admin/quotes','/api/v1/admin/invoices','/api/v1/client/portal','/api/v1/client-profile/resolve','/api/v1/client-profile/complete','/api/v1/admin/clients/:id/profile-link'])if(apiSource.includes(forbidden))fail(`future route introduced early: ${forbidden}`);
if(!/method==='DELETE'/.test(apiSource))pass('no generic HTTP DELETE route introduced; guarded deletion uses explicit POST action');else fail('generic DELETE route introduced');

// 4) Exact API inventory = NX-OPS-1 + two owner-approved lifecycle actions.
const exact=[];
for(const m of apiSource.matchAll(/method==='(GET|POST|PATCH|OPTIONS)'&&path==='([^']+)'/g))exact.push(`${m[1]} ${m[2]}`);
for(const m of apiSource.matchAll(/match\(path,'([^']+)'\);if\(method==='(GET|POST|PATCH)'/g))exact.push(`${m[2]} ${m[1]}`);
const expectedRoutes=[
  'OPTIONS *','GET /api/v1/health','GET /api/v1/health/db','GET /api/v1/services','GET /api/v1/services/:slug','GET /api/v1/projects','GET /api/v1/projects/:slug','GET /api/v1/project-inquiries/config','POST /api/v1/project-inquiries',
  'GET /api/v1/admin/setup/status','POST /api/v1/admin/setup','POST /api/v1/admin/auth/login','GET /api/v1/admin/auth/me','POST /api/v1/admin/auth/logout','GET /api/v1/admin/dashboard',
  'GET /api/v1/admin/inquiries','GET /api/v1/admin/inquiries/:id','POST /api/v1/admin/inquiries/:id/update','PATCH /api/v1/admin/inquiries/:id','POST /api/v1/admin/inquiries/:id/convert-client',
  'GET /api/v1/admin/clients/config','GET /api/v1/admin/clients','POST /api/v1/admin/clients','GET /api/v1/admin/clients/:id','POST /api/v1/admin/clients/:id/update','PATCH /api/v1/admin/clients/:id','POST /api/v1/admin/clients/:id/lifecycle','POST /api/v1/admin/clients/:id/delete','POST /api/v1/admin/clients/:id/contacts','POST /api/v1/admin/clients/:id/contacts/:contactId/update','PATCH /api/v1/admin/clients/:id/contacts/:contactId',
  'GET /api/v1/admin/projects','POST /api/v1/admin/projects/:id/update','PATCH /api/v1/admin/projects/:id','GET /api/v1/admin/services','POST /api/v1/admin/services/:id/update','PATCH /api/v1/admin/services/:id'
];
const actual=['OPTIONS *',...exact].sort(),expected=[...expectedRoutes].sort();
if(JSON.stringify(actual)!==JSON.stringify(expected))fail(`API route inventory mismatch\n${actual.join('\n')}`);else pass(`API route inventory exact (${expected.length})`);

// 5) Runtime authority and guarded delete contracts.
const clients=read('src/modules/operations/clients.js');
for(const fn of ['adminClientCreate','adminClientUpdate','adminClientLifecycle','adminClientDelete','adminClientContactCreate','adminClientContactUpdate','adminInquiryConvertToClient']){
  const start=clients.indexOf(`export async function ${fn}`);if(start<0){fail(`missing handler ${fn}`);continue}
  const next=clients.indexOf('\nexport async function ',start+1);const block=clients.slice(start,next<0?clients.length:next);
  for(const guard of ['assertSameOrigin(request)','requireAdmin(request,env)','requireCsrf(request,env,auth)'])if(!block.includes(guard))fail(`${fn} missing security guard ${guard}`);
}
for(const marker of ["client_code='CU-' || printf('%03d', id)","tax_identifier:clientType==='company'",'CLIENT_LIFECYCLE_TRANSITIONS','clientDeleteBlockers','CLIENT_DELETE_CONFIRMATION_MISMATCH','CLIENT_DELETE_BLOCKED'])if(!clients.includes(marker))fail(`Clients hardening marker missing: ${marker}`);
if(/SET\s+client_code=\?/i.test(clients))fail('client code remains browser-editable in update SQL');else pass('Client Code is server-generated/read-only in runtime');
if(!clients.includes("if(!allowArchived&&c.status==='on_hold')"))fail('deactivated client operational guard missing');
const deleteSql=[...clients.matchAll(/DELETE\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)].map(m=>m[1].toLowerCase());
const expectedDelete=['client_profile_tokens','client_contacts','clients'];
if(JSON.stringify(deleteSql)!==JSON.stringify(expectedDelete))fail(`guarded delete SQL scope mismatch: ${deleteSql.join(', ')}`);else pass('guarded delete SQL limited to token/contact cleanup + eligible client');
if(/\bDROP\s+(TABLE|INDEX)\b/i.test(clients)||/\bTRUNCATE\b/i.test(clients))fail('destructive DDL found in Clients runtime');
if(/SET\s+portal_enabled/i.test(clients))fail('portal_enabled may not be enabled in NX-OPS-1.1A');else pass('Client Portal remains disabled');

// 6) UI contracts and visual/theming hardening.
try{execFileSync(process.execPath,[abs('tests/nx-ops-1-1a/ui-contract.mjs')],{stdio:'inherit'});pass('Clients UI contract: auto code + conditional tax + themed lifecycle controls')}catch{fail('Clients UI contract')}

// 7) Admin visible module inventory stays exact; no empty future navigation.
const adminIndex=read('public/admin/index.html');const views=[...adminIndex.matchAll(/data-view-section="([^"]+)"/g)].map(m=>m[1]);const expectedViews=['overview','inquiries','clients','projects','services'];
if(JSON.stringify(views)!==JSON.stringify(expectedViews))fail(`Admin visible views mismatch: ${views.join(', ')}`);else pass('Admin visible views unchanged: Overview, Inquiries, Clients, Portfolio Projects, Services');

// 8) Structural checks.
const htmlFiles=[],cssFiles=[],jsFiles=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(ent.isFile()){if(p.endsWith('.html'))htmlFiles.push(p);if(p.endsWith('.css'))cssFiles.push(p);if(p.endsWith('.js'))jsFiles.push(p)}}}
walk(abs('public'));walk(abs('src'));
let htmlOk=true;for(const f of htmlFiles){const text=fs.readFileSync(f,'utf8'),ids=[...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),dup=ids.filter((x,i)=>ids.indexOf(x)!==i);if(dup.length){fail(`duplicate HTML ids in ${path.relative(root,f)}: ${[...new Set(dup)].join(',')}`);htmlOk=false}}if(htmlOk)pass(`HTML duplicate IDs (${htmlFiles.length} pages)`);
function stripCss(s){return s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'')}
let cssOk=true;for(const f of cssFiles){const s=stripCss(fs.readFileSync(f,'utf8'));let n=0;for(const c of s){if(c==='{')n++;else if(c==='}')n--;if(n<0)break}if(n!==0){fail(`CSS brace imbalance: ${path.relative(root,f)}`);cssOk=false}}if(cssOk)pass(`CSS structure (${cssFiles.length} files)`);
let syntaxOk=true;for(const f of jsFiles){try{execFileSync(process.execPath,['--check',f],{stdio:'pipe'})}catch{fail(`JavaScript syntax: ${path.relative(root,f)}`);syntaxOk=false}}
for(const rel of ['tests/nx-ops-1/existing-admin-compat.mjs','tests/nx-ops-1-1a/worker-integration.mjs','tests/nx-ops-1-1a/ui-contract.mjs']){try{execFileSync(process.execPath,['--check',abs(rel)],{stdio:'pipe'})}catch{fail(`JavaScript syntax: ${rel}`);syntaxOk=false}}
if(syntaxOk)pass(`runtime/test JavaScript syntax (${jsFiles.length+3} files)`);

// 9) Run the accepted forward-only 0006 alignment proof because runtime assumes CU-{id}.
function runPythonProof(){const attempts=process.platform==='win32'?[['python',[]],['py',['-3']]]:[['python3',[]],['python',[]]];for(const [cmd,args] of attempts){const probe=spawnSync(cmd,[...args,'--version'],{stdio:'ignore'});if(probe.status!==0)continue;execFileSync(cmd,[...args,abs('tests/nx-data-1-2/schema-proof.py')],{stdio:'inherit'});return}throw new Error('Python 3 not found')}
try{runPythonProof();pass('NX-DATA-1.2 Client Code alignment schema proof PASS')}catch(e){fail(`NX-DATA-1.2 schema proof: ${e.message}`)}

// 10) Behavioral gates.
const env={...process.env,NODE_NO_WARNINGS:'1'};
try{execFileSync(process.execPath,[abs('tests/nx-core-2/worker-parity.mjs')],{stdio:'inherit',env});pass('public/unauthenticated Worker parity 21/21')}catch{fail('public/unauthenticated Worker parity')}
try{execFileSync(process.execPath,[abs('tests/nx-ops-1/existing-admin-compat.mjs')],{stdio:'inherit',env});pass('existing authenticated Admin compatibility 10/10')}catch{fail('existing authenticated Admin compatibility')}
try{execFileSync(process.execPath,[abs('tests/nx-ops-1-1a/worker-integration.mjs')],{stdio:'inherit',env});pass('NX-OPS-1.1A Clients hardening integration')}catch{fail('NX-OPS-1.1A Clients hardening integration')}

if(process.exitCode){console.error('\nNX-OPS-1.1A CHECK: FAIL');process.exit(process.exitCode)}else console.log('\nNX-OPS-1.1A CHECK: PASS');
