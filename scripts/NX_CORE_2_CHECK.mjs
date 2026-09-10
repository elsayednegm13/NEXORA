import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const sha=rel=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex');
const fail=msg=>{console.error('FAIL',msg);process.exitCode=1;};
const pass=msg=>console.log('PASS',msg);

// 1. Phase 6.2 protected files must remain byte-identical.
const manifest=JSON.parse(read('scripts/NX_CORE_2_PROTECTED_BASELINE_SHA256.json'));
let protectedOk=true;
for(const [rel,expected] of Object.entries(manifest)){
  const abs=path.join(root,rel);
  if(!fs.existsSync(abs)){fail(`protected file missing: ${rel}`);protectedOk=false;continue;}
  const actual=sha(rel);
  if(actual!==expected){fail(`protected file changed: ${rel}`);protectedOk=false;}
}
if(protectedOk)pass(`protected Phase 6.2 files byte-identical (${Object.keys(manifest).length})`);

// 2. Admin index is allowed exactly one semantic change: classic defer -> module loader.
const adminIndex=read('public/admin/index.html');
if(!adminIndex.includes('<script type="module" src="js/admin.js"></script>')) fail('admin module entry script missing');
else {
  const normalized=adminIndex.replace('<script type="module" src="js/admin.js"></script>','<script src="js/admin.js" defer></script>');
  const h=crypto.createHash('sha256').update(normalized).digest('hex');
  const expected='f69048b2a24c05105505cf781281fb3164cbb63dfe67f0c405169bfd02c9c72e';
  if(h!==expected)fail('admin/index.html contains changes beyond module script switch'); else pass('admin/index.html shell preserved');
}

// 3. No schema/data phase may appear in NX-CORE-2.
const migrations=fs.readdirSync(path.join(root,'migrations')).filter(x=>x.endsWith('.sql')).sort();
const expectedMigrations=['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql'];
if(JSON.stringify(migrations)!==JSON.stringify(expectedMigrations)) fail(`migration inventory changed: ${migrations.join(', ')}`); else pass('migration inventory unchanged (0001..0003 only)');

// 4. Worker route inventory must remain exact.
const apiSource=read('src/api-router.js');
const pairs=[];
for(const m of apiSource.matchAll(/method==='(GET|POST|PATCH|OPTIONS)'&&path==='([^']+)'/g))pairs.push(`${m[1]} ${m[2]}`);
for(const m of apiSource.matchAll(/match\(path,'([^']+)'\);if\(method==='(GET|POST|PATCH)'/g))pairs.push(`${m[2]} ${m[1]}`);
const expectedRoutes=[
 'OPTIONS *',
 'GET /api/v1/health','GET /api/v1/health/db','GET /api/v1/services','GET /api/v1/services/:slug','GET /api/v1/projects','GET /api/v1/projects/:slug','GET /api/v1/project-inquiries/config','POST /api/v1/project-inquiries',
 'GET /api/v1/admin/setup/status','POST /api/v1/admin/setup','POST /api/v1/admin/auth/login','GET /api/v1/admin/auth/me','POST /api/v1/admin/auth/logout','GET /api/v1/admin/dashboard','GET /api/v1/admin/inquiries','GET /api/v1/admin/inquiries/:id','POST /api/v1/admin/inquiries/:id/update','PATCH /api/v1/admin/inquiries/:id','GET /api/v1/admin/projects','POST /api/v1/admin/projects/:id/update','PATCH /api/v1/admin/projects/:id','GET /api/v1/admin/services','POST /api/v1/admin/services/:id/update','PATCH /api/v1/admin/services/:id'
];
// OPTIONS is expressed generically in code.
const actual=['OPTIONS *',...pairs].sort();
const expected=[...expectedRoutes].sort();
if(JSON.stringify(actual)!==JSON.stringify(expected)){fail(`API route inventory changed\nactual=${actual.join('\n')}`);}else pass(`API route inventory preserved (${expected.length})`);

// 5. Core modular boundaries must exist and monolith entrypoints must stay small.
const required=[
 'src/core/errors.js','src/core/http.js','src/core/validation.js','src/core/crypto.js','src/core/auth-admin.js','src/core/audit.js','src/core/rate-limit.js','src/core/router.js','src/api-router.js',
 'src/modules/public/services.js','src/modules/public/projects.js','src/modules/inquiries/public.js','src/modules/admin/auth.js','src/modules/admin/dashboard.js','src/modules/admin/inquiries.js','src/modules/cms/projects-admin.js','src/modules/cms/services-admin.js',
 'public/admin/js/app.js','public/admin/js/core/state.js','public/admin/js/core/dom.js','public/admin/js/core/i18n.js','public/admin/js/core/theme.js','public/admin/js/core/api.js','public/admin/js/core/ui.js','public/admin/js/core/router.js','public/admin/js/core/auth.js',
 'public/admin/js/modules/overview.js','public/admin/js/modules/inquiries.js','public/admin/js/modules/portfolio-projects.js','public/admin/js/modules/services.js'
];
let requiredOk=true;for(const rel of required)if(!fs.existsSync(path.join(root,rel))){fail(`required module missing: ${rel}`);requiredOk=false;}if(requiredOk)pass(`modular foundation present (${required.length} modules)`);
const workerLines=read('src/worker.js').split(/\r?\n/).length;
const adminEntryLines=read('public/admin/js/admin.js').split(/\r?\n/).length;
if(workerLines>30)fail(`src/worker.js entry grew to ${workerLines} lines`);else pass(`worker entry reduced to ${workerLines} lines`);
if(adminEntryLines>20)fail(`admin.js compatibility entry grew to ${adminEntryLines} lines`);else pass(`admin compatibility entry reduced to ${adminEntryLines} lines`);

// 6. Phase 6.2 behavior guards.
const adminState=read('public/admin/js/core/state.js');
if(!/syncInterval:20000/.test(adminState))fail('20-second Inquiry live sync interval changed');else pass('20-second Inquiry live sync retained');
const i18n=read('public/admin/js/core/i18n.js');
for(const status of ['new','reviewing','qualified','contacted','proposal_sent','won','lost','spam','archived'])if(!i18n.includes(status))fail(`Inquiry status missing: ${status}`);
if(!process.exitCode)pass('Inquiry status catalog retained');
const index=adminIndex;
const views=[...index.matchAll(/data-view-section="([^"]+)"/g)].map(m=>m[1]);
if(JSON.stringify(views)!==JSON.stringify(['overview','inquiries','projects','services']))fail(`Admin visible module inventory changed: ${views.join(',')}`);else pass('Admin visible modules unchanged');

// 7. JavaScript syntax for all runtime JS files.
const js=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(ent.isFile()&&p.endsWith('.js'))js.push(p);}}
walk(path.join(root,'src'));walk(path.join(root,'public'));
let syntaxOk=true;
for(const f of js){try{execFileSync(process.execPath,['--check',f],{stdio:'pipe'});}catch(e){fail(`JS syntax: ${path.relative(root,f)}`);syntaxOk=false;}}
if(syntaxOk)pass(`JavaScript syntax (${js.length} files)`);

// 8. Behavioral parity against the frozen Phase 6.2 Worker fixture.
try {
  execFileSync(process.execPath,[path.join(root,'tests/nx-core-2/worker-parity.mjs')],{stdio:'inherit'});
  execFileSync(process.execPath,[path.join(root,'tests/nx-core-2/admin-worker-parity.mjs')],{stdio:'inherit'});
  pass('Worker public + authenticated Admin behavioral parity');
} catch { fail('Worker behavioral parity'); }

if(process.exitCode){console.error('\nNX-CORE-2 CHECK: FAIL');process.exit(process.exitCode);}else console.log('\nNX-CORE-2 CHECK: PASS');
