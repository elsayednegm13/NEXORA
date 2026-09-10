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

const approvedChanges=new Set([
  'src/api-router.js','src/modules/operations/clients.js','public/admin/js/modules/clients.js','public/admin/js/core/ui.js','public/admin/js/core/i18n.js','public/admin/css/admin.css'
]);
const expectedRuntimeAdditions=new Set(['src/modules/operations/client-profile.js','public/client-profile.html','public/css/client-profile.css','public/js/client-profile.js']);
const manifest=JSON.parse(read('scripts/NX_OPS_1_1B_PROTECTED_BASELINE_SHA256.json'));
let protectedOk=true,protectedCount=0;
for(const [rel,expected] of Object.entries(manifest)){
  if(approvedChanges.has(rel))continue;protectedCount++;
  if(!exists(rel)){fail(`protected NX-OPS-1.1A file missing: ${rel}`);protectedOk=false;continue}
  if(sha(rel)!==expected){fail(`protected NX-OPS-1.1A file changed outside approved surface: ${rel}`);protectedOk=false}
}
if(protectedOk){pass(`NX-OPS-1.1A protected baseline byte-identical outside approved surface (${protectedCount})`);const oldPublic=Object.keys(manifest).filter(x=>x.startsWith('public/')&&!x.startsWith('public/admin/')).length;if(oldPublic===35)pass('existing public website byte-identical (35 files)');else fail(`unexpected existing public baseline count ${oldPublic}`)}
for(const rel of approvedChanges)if(!exists(rel))fail(`approved change missing: ${rel}`);
for(const rel of expectedRuntimeAdditions)if(!exists(rel))fail(`required NX-OPS-1.1B runtime addition missing: ${rel}`);else pass(`runtime addition present: ${rel}`);

const migrations=fs.readdirSync(abs('migrations')).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
const expectedMigrations=['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql','0005_clients_hardening.sql','0006_clients_code_alignment.sql'];
if(JSON.stringify(migrations)!==JSON.stringify(expectedMigrations))fail(`migration inventory mismatch: ${migrations.join(', ')}`);else pass('migration inventory exact (0001..0006 only; no NX-OPS-1.1B migration)');
const hashes={'0001_schema.sql':'f15d52ce1d8cc85927b80e6a4e66702de03c6a5f0cdc4808fd45ed3303f2071c','0002_seed.sql':'67aadca2061e63129479739e1546865ce337cc52a88bb0cfbe771eb6d5d804cc','0003_inquiry_locale.sql':'67058b0525f0ed1029a9dd89f3dd1df23ae2e99b9c173c6f4c2ebd70c835f113','0004_clients_core.sql':'4e202a5b9bf9d558f4ed4b0b1593991885fde15b31af976ae14b92ea1be1b533','0005_clients_hardening.sql':'24f1cf87f56fc031848c275f3288ebc62784d019e9fa4d4d992e7987d7c43f8f','0006_clients_code_alignment.sql':'497ee9e3572035abf77586e17786978716f0660cf9aacd0fc64b7404fb03a71e'};
let hashOk=true;for(const [f,h] of Object.entries(hashes))if(sha(`migrations/${f}`)!==h){fail(`accepted migration hash changed: ${f}`);hashOk=false}if(hashOk)pass('accepted migrations 0001..0006 byte-identical');

const apiSource=read('src/api-router.js');
for(const forbidden of ['/api/v1/admin/client-projects','/api/v1/admin/tasks','/api/v1/admin/milestones','/api/v1/admin/tickets','/api/v1/admin/quotes','/api/v1/admin/invoices','/api/v1/client/portal'])if(apiSource.includes(forbidden))fail(`future module route introduced early: ${forbidden}`);
if(/method==='DELETE'/.test(apiSource))fail('generic HTTP DELETE route introduced');else pass('no generic HTTP DELETE route');
const exact=[];for(const m of apiSource.matchAll(/method==='(GET|POST|PATCH|OPTIONS)'&&path==='([^']+)'/g))exact.push(`${m[1]} ${m[2]}`);for(const m of apiSource.matchAll(/match\(path,'([^']+)'\);if\(method==='(GET|POST|PATCH)'/g))exact.push(`${m[2]} ${m[1]}`);
const expectedRoutes=['OPTIONS *','GET /api/v1/health','GET /api/v1/health/db','GET /api/v1/services','GET /api/v1/services/:slug','GET /api/v1/projects','GET /api/v1/projects/:slug','GET /api/v1/project-inquiries/config','POST /api/v1/project-inquiries','POST /api/v1/client-profile/resolve','POST /api/v1/client-profile/complete','GET /api/v1/admin/setup/status','POST /api/v1/admin/setup','POST /api/v1/admin/auth/login','GET /api/v1/admin/auth/me','POST /api/v1/admin/auth/logout','GET /api/v1/admin/dashboard','GET /api/v1/admin/inquiries','GET /api/v1/admin/inquiries/:id','POST /api/v1/admin/inquiries/:id/update','PATCH /api/v1/admin/inquiries/:id','POST /api/v1/admin/inquiries/:id/convert-client','GET /api/v1/admin/clients/config','GET /api/v1/admin/clients','POST /api/v1/admin/clients','GET /api/v1/admin/clients/:id','POST /api/v1/admin/clients/:id/update','PATCH /api/v1/admin/clients/:id','POST /api/v1/admin/clients/:id/lifecycle','POST /api/v1/admin/clients/:id/delete','GET /api/v1/admin/clients/:id/profile-completion','POST /api/v1/admin/clients/:id/profile-completion/generate','POST /api/v1/admin/clients/:id/profile-completion/revoke','POST /api/v1/admin/clients/:id/contacts','POST /api/v1/admin/clients/:id/contacts/:contactId/update','PATCH /api/v1/admin/clients/:id/contacts/:contactId','GET /api/v1/admin/projects','POST /api/v1/admin/projects/:id/update','PATCH /api/v1/admin/projects/:id','GET /api/v1/admin/services','POST /api/v1/admin/services/:id/update','PATCH /api/v1/admin/services/:id'];
const actual=['OPTIONS *',...exact].sort(),expected=[...expectedRoutes].sort();if(JSON.stringify(actual)!==JSON.stringify(expected))fail(`API route inventory mismatch\n${actual.join('\n')}`);else pass(`API route inventory exact (${expected.length})`);

const profile=read('src/modules/operations/client-profile.js');
for(const marker of ['crypto.getRandomValues(new Uint8Array(32))','sha256Hex(token)','rateAllow','assertSameOrigin(request)','requireCsrf(request,env,auth)','completed_at=?',"tax_identifier:clientType==='company'","new URL('/client-profile.html',request.url)",'#token='])if(!profile.includes(marker))fail(`profile security contract missing: ${marker}`);
if(/INSERT INTO client_profile_tokens\([^)]*\btoken\b/i.test(profile))fail('raw token storage introduced');else pass('profile capability token stored as SHA-256 hash only');
if(profile.includes('context:{token:'))fail('raw token leaked into audit context');else pass('audit context excludes raw capability tokens');
const clients=read('src/modules/operations/clients.js');if(!clients.includes("if(next!=='active')lifecycleBatch.push")||!clients.includes('UPDATE client_profile_tokens SET revoked_at=CURRENT_TIMESTAMP'))fail('lifecycle does not revoke active completion links');else pass('deactivate/archive revoke active completion links');

try{execFileSync(process.execPath,[abs('tests/nx-ops-1-1b/ui-contract.mjs')],{stdio:'inherit'});pass('NX-OPS-1.1B Admin/public UX contract')}catch{fail('NX-OPS-1.1B Admin/public UX contract')}

const adminIndex=read('public/admin/index.html');const views=[...adminIndex.matchAll(/data-view-section="([^"]+)"/g)].map(m=>m[1]);if(JSON.stringify(views)!==JSON.stringify(['overview','inquiries','clients','projects','services']))fail(`Admin visible views mismatch: ${views.join(',')}`);else pass('Admin visible views unchanged');

const htmlFiles=[],cssFiles=[],jsFiles=[];function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(ent.isFile()){if(p.endsWith('.html'))htmlFiles.push(p);if(p.endsWith('.css'))cssFiles.push(p);if(p.endsWith('.js'))jsFiles.push(p)}}}walk(abs('public'));walk(abs('src'));
let htmlOk=true;for(const f of htmlFiles){const text=fs.readFileSync(f,'utf8'),ids=[...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),dup=ids.filter((x,i)=>ids.indexOf(x)!==i);if(dup.length){fail(`duplicate HTML ids in ${path.relative(root,f)}: ${[...new Set(dup)].join(',')}`);htmlOk=false}}if(htmlOk)pass(`HTML duplicate IDs (${htmlFiles.length} pages)`);
function stripCss(s){return s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'')}let cssOk=true;for(const f of cssFiles){const s=stripCss(fs.readFileSync(f,'utf8'));let n=0;for(const c of s){if(c==='{')n++;else if(c==='}')n--;if(n<0)break}if(n!==0){fail(`CSS brace imbalance: ${path.relative(root,f)}`);cssOk=false}}if(cssOk)pass(`CSS structure (${cssFiles.length} files)`);
let syntaxOk=true;for(const f of jsFiles){try{execFileSync(process.execPath,['--check',f],{stdio:'ignore'})}catch{fail(`JavaScript syntax: ${path.relative(root,f)}`);syntaxOk=false}}if(syntaxOk)pass(`runtime JavaScript syntax (${jsFiles.length} files)`);

const run=(label,rel)=>{try{execFileSync(process.execPath,[abs(rel)],{stdio:'inherit'});pass(label)}catch{fail(label)}};
run('accepted NX-DATA-1.2 schema/runtime proof','scripts/NX_DATA_1_2_CHECK.mjs');
run('public/unauthenticated Worker parity 21/21','tests/nx-core-2/worker-parity.mjs');
run('existing authenticated Admin compatibility 10/10','tests/nx-ops-1/existing-admin-compat.mjs');
run('NX-OPS-1.1A Clients hardening integration regression','tests/nx-ops-1-1a/worker-integration.mjs');
run('NX-OPS-1.1A UI regression','tests/nx-ops-1-1a/ui-contract.mjs');
run('NX-OPS-1.1B secure profile completion integration','tests/nx-ops-1-1b/worker-integration.mjs');

if(process.exitCode){console.error('\nNX-OPS-1.1B CHECK: FAIL');process.exit(process.exitCode)}else console.log('\nNX-OPS-1.1B CHECK: PASS');
