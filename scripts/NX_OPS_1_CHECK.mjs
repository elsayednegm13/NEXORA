import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const abs=rel=>path.join(root,rel);
const read=rel=>fs.readFileSync(abs(rel),'utf8');
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(abs(rel))).digest('hex');
const fail=msg=>{console.error('FAIL',msg);process.exitCode=1;};
const pass=msg=>console.log('PASS',msg);
const exists=rel=>fs.existsSync(abs(rel));

// 1) Protect every pre-existing NX-DATA-1 file outside the explicit NX-OPS-1 change surface.
const manifest=JSON.parse(read('scripts/NX_OPS_1_PROTECTED_BASELINE_SHA256.json'));
let protectedOk=true;
for(const [rel,expected] of Object.entries(manifest)){
  if(!exists(rel)){fail(`protected baseline file missing: ${rel}`);protectedOk=false;continue;}
  const actual=sha(rel);
  if(actual!==expected){fail(`protected baseline file changed: ${rel}`);protectedOk=false;}
}
if(protectedOk){
  pass(`NX-DATA-1 protected files byte-identical (${Object.keys(manifest).length})`);
  const publicCount=Object.keys(manifest).filter(x=>x.startsWith('public/')&&!x.startsWith('public/admin/')).length;
  if(publicCount!==35)fail(`unexpected protected public non-admin inventory: ${publicCount}`); else pass('public website byte-identical (35 files)');
}

// 2) No schema expansion in NX-OPS-1: 0004 is the existing prerequisite and there is no 0005.
const migrations=fs.readdirSync(abs('migrations')).filter(x=>x.endsWith('.sql')).sort();
const expectedMigrations=['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql'];
if(JSON.stringify(migrations)!==JSON.stringify(expectedMigrations))fail(`migration inventory changed: ${migrations.join(', ')}`);else pass('migration inventory exact (0001..0004 only)');
const migrationHashes={
  '0001_schema.sql':'f15d52ce1d8cc85927b80e6a4e66702de03c6a5f0cdc4808fd45ed3303f2071c',
  '0002_seed.sql':'67aadca2061e63129479739e1546865ce337cc52a88bb0cfbe771eb6d5d804cc',
  '0003_inquiry_locale.sql':'67058b0525f0ed1029a9dd89f3dd1df23ae2e99b9c173c6f4c2ebd70c835f113',
  '0004_clients_core.sql':'4e202a5b9bf9d558f4ed4b0b1593991885fde15b31af976ae14b92ea1be1b533'
};
for(const [f,h] of Object.entries(migrationHashes))if(sha(`migrations/${f}`)!==h)fail(`migration hash changed: ${f}`);
if(!process.exitCode)pass('all migration bytes retained from NX-DATA-1');

// 3) Required Clients boundaries exist; future domains must not appear yet.
const required=[
  'src/modules/operations/clients.js',
  'public/admin/js/modules/clients.js',
  'tests/nx-ops-1/worker-integration.mjs',
  'tests/nx-ops-1/existing-admin-compat.mjs'
];
let reqOk=true;for(const rel of required)if(!exists(rel)){fail(`required NX-OPS-1 file missing: ${rel}`);reqOk=false;}if(reqOk)pass('Clients module boundaries present');
const apiSource=read('src/api-router.js');
for(const forbidden of ['/api/v1/admin/client-projects','/api/v1/admin/tasks','/api/v1/admin/milestones','/api/v1/admin/tickets','/api/v1/admin/quotes','/api/v1/admin/invoices','/api/v1/client/portal']){
  if(apiSource.includes(forbidden))fail(`future route introduced early: ${forbidden}`);
}
if(!/method==='DELETE'/.test(apiSource))pass('no Admin DELETE routes introduced'); else fail('DELETE route introduced');

// 4) Exact API route inventory: existing Phase 6.2 routes + Clients only.
const exact=[];
for(const m of apiSource.matchAll(/method==='(GET|POST|PATCH|OPTIONS)'&&path==='([^']+)'/g))exact.push(`${m[1]} ${m[2]}`);
for(const m of apiSource.matchAll(/match\(path,'([^']+)'\);if\(method==='(GET|POST|PATCH)'/g))exact.push(`${m[2]} ${m[1]}`);
const expectedRoutes=[
  'OPTIONS *',
  'GET /api/v1/health','GET /api/v1/health/db','GET /api/v1/services','GET /api/v1/services/:slug','GET /api/v1/projects','GET /api/v1/projects/:slug','GET /api/v1/project-inquiries/config','POST /api/v1/project-inquiries',
  'GET /api/v1/admin/setup/status','POST /api/v1/admin/setup','POST /api/v1/admin/auth/login','GET /api/v1/admin/auth/me','POST /api/v1/admin/auth/logout','GET /api/v1/admin/dashboard',
  'GET /api/v1/admin/inquiries','GET /api/v1/admin/inquiries/:id','POST /api/v1/admin/inquiries/:id/update','PATCH /api/v1/admin/inquiries/:id','POST /api/v1/admin/inquiries/:id/convert-client',
  'GET /api/v1/admin/clients/config','GET /api/v1/admin/clients','POST /api/v1/admin/clients','GET /api/v1/admin/clients/:id','POST /api/v1/admin/clients/:id/update','PATCH /api/v1/admin/clients/:id','POST /api/v1/admin/clients/:id/contacts','POST /api/v1/admin/clients/:id/contacts/:contactId/update','PATCH /api/v1/admin/clients/:id/contacts/:contactId',
  'GET /api/v1/admin/projects','POST /api/v1/admin/projects/:id/update','PATCH /api/v1/admin/projects/:id','GET /api/v1/admin/services','POST /api/v1/admin/services/:id/update','PATCH /api/v1/admin/services/:id'
];
const actualRoutes=['OPTIONS *',...exact].sort();
const expectedSorted=[...expectedRoutes].sort();
if(JSON.stringify(actualRoutes)!==JSON.stringify(expectedSorted))fail(`API route inventory mismatch\nactual:\n${actualRoutes.join('\n')}`);else pass(`API route inventory exact (${expectedSorted.length})`);

// 5) Clients security and no-hard-delete invariants.
const clientsSource=read('src/modules/operations/clients.js');
for(const fn of ['adminClientCreate','adminClientUpdate','adminClientContactCreate','adminClientContactUpdate','adminInquiryConvertToClient']){
  const start=clientsSource.indexOf(`export async function ${fn}`);
  if(start<0){fail(`missing write handler ${fn}`);continue;}
  const next=clientsSource.indexOf('\nexport async function ',start+1);
  const block=clientsSource.slice(start,next<0?clientsSource.length:next);
  for(const guard of ['assertSameOrigin(request)','requireAdmin(request,env)','requireCsrf(request,env,auth)'])if(!block.includes(guard))fail(`${fn} missing guard: ${guard}`);
}
if(/\bDELETE\s+FROM\b/i.test(clientsSource)||/\bDROP\s+(TABLE|INDEX)\b/i.test(clientsSource)||/\bTRUNCATE\b/i.test(clientsSource))fail('destructive SQL found in Clients runtime module');else pass('Clients runtime has no destructive SQL');
if(/SET\s+portal_enabled/i.test(clientsSource))fail('portal_enabled may not be enabled in NX-OPS-1');else pass('Client Portal remains disabled in NX-OPS-1');
for(const marker of ['already_converted:true','inquiry_conversions','status_at_conversion','PAGE_SIZE=50','next_cursor'])if(!clientsSource.includes(marker))fail(`Clients invariant marker missing: ${marker}`);
if(!process.exitCode)pass('conversion idempotency/provenance/pagination guards present');

// 6) Admin view inventory: no empty future screens.
const adminIndex=read('public/admin/index.html');
const views=[...adminIndex.matchAll(/data-view-section="([^"]+)"/g)].map(m=>m[1]);
const expectedViews=['overview','inquiries','clients','projects','services'];
if(JSON.stringify(views)!==JSON.stringify(expectedViews))fail(`Admin visible view inventory mismatch: ${views.join(', ')}`);else pass('Admin visible views exact: Overview, Inquiries, Clients, Portfolio Projects, Services');
for(const id of ['view-client-projects','view-tasks','view-milestones','view-tickets','view-quotes','view-invoices','view-portal'])if(adminIndex.includes(id))fail(`empty future UI introduced: ${id}`);
const i18n=read('public/admin/js/core/i18n.js');
for(const key of ['clients','addClient','clientContacts','convertToClient','createNewClient','linkExistingClient','portfolioProjects'])if(!i18n.includes(`${key}:`))fail(`missing i18n key: ${key}`);

// 7) HTML duplicate IDs and CSS structural sanity.
const htmlFiles=[];const cssFiles=[];const jsFiles=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(ent.isFile()){if(p.endsWith('.html'))htmlFiles.push(p);if(p.endsWith('.css'))cssFiles.push(p);if(p.endsWith('.js'))jsFiles.push(p);}}}
walk(abs('public'));walk(abs('src'));
let htmlOk=true;
for(const f of htmlFiles){const text=fs.readFileSync(f,'utf8');const ids=[...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);const d=ids.filter((x,i)=>ids.indexOf(x)!==i);if(d.length){fail(`duplicate HTML ids in ${path.relative(root,f)}: ${[...new Set(d)].join(',')}`);htmlOk=false;}}
if(htmlOk)pass(`HTML duplicate IDs (${htmlFiles.length} pages)`);
function stripCss(s){return s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'');}
let cssOk=true;for(const f of cssFiles){const s=stripCss(fs.readFileSync(f,'utf8'));let n=0;for(const c of s){if(c==='{')n++;else if(c==='}')n--;if(n<0)break;}if(n!==0){fail(`CSS brace imbalance: ${path.relative(root,f)}`);cssOk=false;}}
if(cssOk)pass(`CSS structure (${cssFiles.length} files)`);

// 8) Runtime JS syntax.
let syntaxOk=true;
for(const f of jsFiles){try{execFileSync(process.execPath,['--check',f],{stdio:'pipe'});}catch{fail(`JavaScript syntax: ${path.relative(root,f)}`);syntaxOk=false;}}
for(const rel of ['tests/nx-ops-1/worker-integration.mjs','tests/nx-ops-1/existing-admin-compat.mjs']){try{execFileSync(process.execPath,['--check',abs(rel)],{stdio:'pipe'});}catch{fail(`JavaScript syntax: ${rel}`);syntaxOk=false;}}
if(syntaxOk)pass(`runtime/test JavaScript syntax (${jsFiles.length+2} files)`);

// 9) Behavioral gates: existing behavior parity first, then Clients integration.
const env={...process.env,NODE_NO_WARNINGS:'1'};
try{execFileSync(process.execPath,[abs('tests/nx-core-2/worker-parity.mjs')],{stdio:'inherit',env});pass('public/unauthenticated Worker parity 21/21');}catch{fail('public/unauthenticated Worker parity');}
try{execFileSync(process.execPath,[abs('tests/nx-ops-1/existing-admin-compat.mjs')],{stdio:'inherit',env});pass('existing authenticated Admin compatibility 10/10');}catch{fail('existing authenticated Admin compatibility');}
try{execFileSync(process.execPath,[abs('tests/nx-ops-1/worker-integration.mjs')],{stdio:'inherit',env});pass('Clients + Inquiry conversion integration');}catch{fail('Clients + Inquiry conversion integration');}

if(process.exitCode){console.error('\nNX-OPS-1 CHECK: FAIL');process.exit(process.exitCode);}else console.log('\nNX-OPS-1 CHECK: PASS');
