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

const baselineDoc=JSON.parse(read('scripts/NX_COLLAB_1_UI_R4_1_DEPLOYED_BASELINE_SHA256.json'));
const baseline=baselineDoc.files||{};
const allowedChanged=new Set([
  'public/admin/css/admin.css',
  'tests/nx-collab-1-r4-1-admin/support-containment-visual.html',
  'tests/nx-ops-1/existing-admin-compat.mjs'
]);
for(const [rel,h] of Object.entries(baseline)){
  const p=path.join(root,rel);
  if(!fs.existsSync(p)){fail('R4.1 baseline file missing: '+rel);continue}
  if(!allowedChanged.has(rel)&&sha(p)!==h)fail('R4.1 Live baseline changed outside approved R4.2 surface: '+rel);
}
if(!failed)pass('R4.1 Live baseline protected outside approved compact-density/tooling surface');
if(sha(path.join(root,'public/admin/css/admin.css'))===baseline['public/admin/css/admin.css'])fail('R4.2 admin.css compact-density correction is missing');else pass('admin.css differs from R4.1 by approved compact-density correction');

const css=read('public/admin/css/admin.css');
const densityTokens=[
  'NX-COLLAB-1 UI R4.2',
  'grid-template-rows:58px minmax(0,1fr)',
  'height:102px;min-height:102px',
  'grid-template-columns:minmax(0,1fr);',
  'R4.2 mobile composer width containment'
];
for(const t of densityTokens)if(!css.includes(t))fail('R4.2 CSS contract missing: '+t);
if(/\bzoom\s*:|transform\s*:\s*scale\s*\(/i.test(css.slice(css.indexOf('NX-COLLAB-1 UI R4.2'))))fail('R4.2 must not use CSS zoom/scale as a density workaround');
if(!failed)pass('R4.2 compact-density CSS uses component dimensions, not zoom/scale');

const fixture=read('tests/nx-collab-1-r4-2-support-density-visual.html');
if(!fixture.includes('project-command-hero')||!fixture.includes('projectSupportRoot')||!fixture.includes('عدم الحاجة إلى Zoom Out'))fail('R4.2 density fixture does not mirror the real Admin workspace');else pass('R4.2 real-DOM density fixture present');
const containmentFixture=read('tests/nx-collab-1-r4-1-admin/support-containment-visual.html');
if(!containmentFixture.includes('رسالة ضغط إضافية من فريق NEXORA')||!containmentFixture.includes('رد إضافي من العميل'))fail('R4.1 stress fixture was not strengthened for tall viewport containment');else pass('R4.1 long-message stress fixture strengthened');

const compat=read('tests/nx-ops-1/existing-admin-compat.mjs');
for(const t of ['api_rate_limits','<NOW>','for(const i of [2,3,5,7])'])if(!compat.includes(t))fail('Admin compatibility wall-clock normalization missing: '+t);
if(!failed)pass('Admin compatibility test normalizes only rate-limit wall-clock timestamps');

const migrations=fs.readdirSync(path.join(root,'migrations')).filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort();
const expected=Array.from({length:10},(_,i)=>String(i+1).padStart(4,'0'));
if(migrations.length!==10||migrations.some((n,i)=>!n.startsWith(expected[i]+'_')))fail('migration inventory changed from exact 0001..0010');else pass('migration inventory exact 0001..0010');
if(sha(path.join(root,'migrations','0010_client_project_collaboration.sql'))!==baseline['migrations/0010_client_project_collaboration.sql'])fail('0010 changed from R4.1 baseline');else pass('0010 byte-identical to R4.1 baseline');

const js=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.wrangler'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(?:js|mjs)$/.test(e.name))js.push(p)}}
for(const d of ['src','public','scripts','tests'])walk(path.join(root,d));
for(const p of js){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status!==0){fail('JavaScript syntax '+path.relative(root,p));process.stderr.write(r.stderr||'');break}}
if(!failed)pass('runtime/test/release JavaScript syntax');

const gates=[
 'scripts/NX_DATA_5_CHECK.mjs',
 'scripts/NX_COLLAB_1_FULL_SCHEMA_REGRESSION.mjs',
 'tests/nx-collab-1/worker-integration.mjs',
 'tests/nx-collab-1/ui-contract.mjs',
 'tests/nx-core-2/worker-parity.mjs',
 'tests/nx-ops-1/existing-admin-compat.mjs',
 'scripts/NX_COLLAB_1_UI_R4_BROWSER_GATE.mjs',
 'scripts/NX_COLLAB_1_UI_R4_1_BROWSER_GATE.mjs',
 'scripts/NX_COLLAB_1_UI_R4_2_BROWSER_GATE.mjs'
];
for(const rel of gates){
  const repeats=rel.endsWith('existing-admin-compat.mjs')?4:1;
  for(let i=0;i<repeats;i++){
    const r=spawnSync(process.execPath,[path.join(root,rel)],{cwd:root,encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}});
    process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');
    if(r.status!==0){fail('gate '+rel+(repeats>1?` repeat ${i+1}`:''));break}
  }
  if(!failed)pass('gate '+rel+(repeats>1?' repeated 4x':''));
}

console.log('\nNX-COLLAB-1 UI R4.2 CHECK: '+(failed?'FAIL':'PASS'));
process.exit(failed?1:0);
