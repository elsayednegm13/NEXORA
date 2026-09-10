import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
let failed=false;
const pass=m=>console.log('PASS '+m);
const fail=m=>{failed=true;console.error('FAIL '+m)};
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const baselineDoc=JSON.parse(read('scripts/NX_COLLAB_1_UI_R4_DEPLOYED_BASELINE_SHA256.json'));
const baseline=baselineDoc.files||{};
const allowedChanged=new Set(['public/admin/css/admin.css']);
for(const [rel,h] of Object.entries(baseline)){
  const p=path.join(root,rel);
  if(!fs.existsSync(p)){fail('R4 Live baseline file missing: '+rel);continue}
  if(!allowedChanged.has(rel)&&sha(p)!==h)fail('R4 Live baseline changed outside R4.1 approved surface: '+rel);
}
if(!failed)pass('R4 Live baseline protected; only admin.css runtime change approved');
if(sha(path.join(root,'public/admin/css/admin.css'))===baseline['public/admin/css/admin.css'])fail('R4.1 admin.css correction is missing');else pass('admin.css differs from R4 by approved containment correction');

const newExpected=new Set([
  'NX_COLLAB_1_UI_R4_1_FINAL_CHECK.md',
  'NX_COLLAB_1_UI_R4_1_README.md',
  'docs/NX_COLLAB_1_UI_R4_1_MESSAGE_CONTAINMENT.md',
  'scripts/APPLY_NX_COLLAB_1_UI_R4_1.ps1',
  'scripts/NX_COLLAB_1_UI_R4_1_BROWSER_GATE.mjs',
  'scripts/NX_COLLAB_1_UI_R4_1_CHECK.mjs',
  'scripts/NX_COLLAB_1_UI_R4_1_RELEASE_MANIFEST.json',
  'scripts/NX_COLLAB_1_UI_R4_DEPLOYED_BASELINE_SHA256.json',
  'scripts/RUN_NX_COLLAB_1_UI_R4_1_RELEASE.ps1',
  'tests/nx-collab-1-r4-1-admin/support-containment-visual.html'
]);
const inventory=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.wrangler','.r4-backup'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else inventory.push(path.relative(root,p).replaceAll('\\','/'))}}
walk(root);
const addedActual=new Set(inventory.filter(x=>!Object.hasOwn(baseline,x)));
const missing=[...newExpected].filter(x=>!addedActual.has(x));
const extra=[...addedActual].filter(x=>!newExpected.has(x));
if(missing.length||extra.length)fail('R4.1 added-file inventory mismatch missing=['+missing.join(',')+'] extra=['+extra.join(',')+']');else pass('R4.1 added-file inventory exact ('+addedActual.size+')');

const migrations=fs.readdirSync(path.join(root,'migrations')).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
const expected=['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql','0005_clients_hardening.sql','0006_clients_code_alignment.sql','0007_client_projects.sql','0008_client_project_execution.sql','0009_client_project_portal_support.sql','0010_client_project_collaboration.sql'];
migrations.join('|')===expected.join('|')?pass('migration inventory exact 0001..0010'):fail('migration inventory mismatch');
const migrationRel='migrations/0010_client_project_collaboration.sql';
sha(path.join(root,migrationRel))===baseline[migrationRel]?pass('0010 byte-identical to deployed R4'):fail('0010 changed in R4.1');

const router=read('src/api-router.js');
/method\s*===\s*['"]DELETE['"]/.test(router)?fail('HTTP DELETE route introduced'):pass('no HTTP DELETE route introduced');
const routeCount=(router.match(/if\(method===/g)||[]).length;
routeCount===89?pass('API route inventory unchanged (89 route guards)'):fail('API route inventory changed: '+routeCount);

const css=read('public/admin/css/admin.css');
const support=read('public/admin/js/modules/client-project-support.js');
const fixture=read('tests/nx-collab-1-r4-1-admin/support-containment-visual.html');
for(const token of ['NX-COLLAB-1 UI R4.1',' #projectSupportRoot'.trim(),'#projectFilesRoot','#projectAccessRoot','height:100%!important','overscroll-behavior:contain','word-break:break-word']){
  if(!css.includes(token))fail('R4.1 containment CSS contract missing: '+token);
}
if(!failed)pass('R4.1 real-DOM containment CSS contract present');
for(const token of ['id="projectSupportRoot"','id="projectFilesRoot"','id="projectAccessRoot"'])if(!support.includes(token))fail('runtime wrapper missing: '+token);
if(!failed)pass('Admin runtime wrapper hierarchy confirmed');
if(!fixture.includes('id="projectSupportRoot"')||!fixture.includes('عدم الحاجة إلى Zoom Out'))fail('R4.1 stress fixture does not mirror real wrapper + long-message case');else pass('R4.1 real-DOM long-message stress fixture present');

const js=[];function walkJs(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.wrangler'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walkJs(p);else if(/\.(?:js|mjs)$/.test(e.name))js.push(p)}}
walkJs(path.join(root,'src'));walkJs(path.join(root,'public'));walkJs(path.join(root,'scripts'));walkJs(path.join(root,'tests'));
for(const p of js){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status!==0){fail('JavaScript syntax '+path.relative(root,p));break}}
if(!failed)pass('runtime/test/release JavaScript syntax');

const gates=[
 'scripts/NX_DATA_5_CHECK.mjs',
 'scripts/NX_COLLAB_1_FULL_SCHEMA_REGRESSION.mjs',
 'tests/nx-collab-1/worker-integration.mjs',
 'tests/nx-collab-1/ui-contract.mjs',
 'tests/nx-core-2/worker-parity.mjs',
 'tests/nx-ops-1/existing-admin-compat.mjs',
 'scripts/NX_COLLAB_1_UI_R4_BROWSER_GATE.mjs',
 'scripts/NX_COLLAB_1_UI_R4_1_BROWSER_GATE.mjs'
];
for(const rel of gates){const r=spawnSync(process.execPath,[path.join(root,rel)],{cwd:root,encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)fail('gate '+rel);else pass('gate '+rel)}

console.log('\nNX-COLLAB-1 UI R4.1 CHECK: '+(failed?'FAIL':'PASS'));
process.exit(failed?1:0);
