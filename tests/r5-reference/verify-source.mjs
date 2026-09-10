// Source checks only. Passing this script is NOT browser or visual acceptance.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(here,'protected-source.json'),'utf8'));
for(const [name,digest]of Object.entries(manifest.files))assert.equal(sha(fs.readFileSync(path.join(root,name))),digest,`Protected repository file changed: ${name}`);
const support=read('public/admin/js/modules/client-project-support.js');
for(const guard of manifest.behavior){
  let slice=support.slice(support.indexOf(guard.start),support.indexOf(guard.end));
  for(const addition of manifest.allowedUiLines)slice=slice.replace(addition,'');
  assert.equal(sha(slice),guard.sha256,`Existing behavior changed: ${guard.start}`);
}
const css=read('public/admin/css/r5-reference.css');
const reference=fs.readFileSync(path.join(here,'approved-prototype.html'),'utf8');
assert.equal(sha(reference),manifest.referenceSha256,'Approved reference changed');
function rule(source,selector){const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const match=source.match(new RegExp(escaped+'\\s*\\{([^}]*)\\}'));assert.ok(match,`Missing rule: ${selector}`);return Object.fromEntries(match[1].split(';').map(p=>{const i=p.indexOf(':');return [p.slice(0,i).trim(),p.slice(i+1).replace(/\s+/g,' ').trim()]}).filter(([k])=>k))}
const mappings=[
  ['.project-copy h1','.project-command-copy h2',['font-size','line-height']],
  ['.avatar','.project-command-avatar',['width','height','border-radius']],
  ['.modules','.project-workspace-nav',['gap','padding','border-radius']],
  ['.ticket-list','.admin-ticket-list',['padding']],
  ['.ticket','.admin-ticket-row',['padding','gap']],
  ['.messages','.admin-ticket-thread',['padding','gap','scrollbar-gutter']],
  ['.bubble','.admin-message-bubble',['padding','font-size','line-height','border-radius']],
  ['.composer','.admin-ticket-composer',['padding']],
  ['.compose-shell','.admin-composer-row',['grid-template-columns','gap','padding','border-radius']],
  ['.control select','.admin-ticket-controls select',['height','border-radius','font-size']],
];
let compared=0;
for(const [original,actual,props]of mappings){const a=rule(reference,original),b=rule(css,'#projectWorkspaceLayer '+actual);for(const p of props){assert.equal(b[p],a[p],`Reference mismatch: ${actual} / ${p}`);compared++}}
assert.equal(rule(css,'#projectWorkspaceLayer')['grid-template-rows'],'58px minmax(0,1fr)');
assert.equal(rule(css,'#projectWorkspaceLayer .project-workspace-shell')['grid-template-rows'],'72px minmax(0,1fr)');
assert.equal(rule(css,'#projectWorkspaceLayer .admin-support-workspace')['grid-template-columns'],'minmax(300px,.31fr) minmax(0,.69fr)');
assert.ok(css.includes('grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto'));
assert.ok(!/\bzoom\s*:|\bscale\s*\(/i.test(css),'No zoom or scale layout workaround');
assert.ok(read('public/admin/js/modules/client-projects.js').includes('<div class="project-context-row">${projectHeader(p)}${projectWorkspaceNav()}</div>'));
assert.ok(support.includes('</div></div></header>${thread(selected)}'),'Ticket controls must be inside conversation header');
assert.ok(support.includes('data-ticket-mobile-back'));
assert.ok(support.includes('data-toggle-ticket-controls aria-expanded="false"'));
assert.ok(support.includes('name="visibility"'),'Message visibility must remain accessible');
assert.ok(read('public/admin/index.html').includes('href="css/r5-reference.css"'));
console.log(`R5_REFERENCE_SOURCE_PASS: ${compared} reference declarations, ${Object.keys(manifest.files).length} unchanged files, ${manifest.behavior.length} behavior guards.`);
console.log('BROWSER_VISUAL_ACCEPTANCE: NOT_RUN. Source checks cannot certify pixel or interaction parity.');
