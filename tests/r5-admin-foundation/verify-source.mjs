// Source-only guard for the R5.1 Admin Foundation. This is not browser acceptance.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const css=fs.readFileSync(path.join(root,'public/admin/css/r5-admin-foundation.css'),'utf8');
const html=fs.readFileSync(path.join(root,'public/admin/index.html'),'utf8');
const has=value=>assert.ok(css.includes(value),`Missing foundation rule: ${value}`);

assert.ok(html.includes('href="css/r5-admin-foundation.css"'),'Foundation stylesheet is not loaded');
for(const value of [
  '#appView .topbar {\n  height:58px;',
  '#appView .content-wrap {\n  min-height:calc(100vh - 58px);',
  '#appView .hero-panel {\n  min-height:146px;',
  '#appView .stats-grid {grid-template-columns:repeat(4,minmax(0,1fr))',
  '#appView .section-tools {\n  min-height:48px;',
  '#appView .table-panel {\n  border:1px solid var(--nx-r5-line);',
  '#appView .manage-grid {grid-template-columns:repeat(2,minmax(0,1fr))',
  '#appView ::-webkit-scrollbar-thumb',
  '@media(max-width:900px)',
  '@media(max-width:560px)',
  '@media(prefers-reduced-motion:reduce)',
])has(value);
assert.ok(!/\bzoom\s*:|\bscale\s*\(/i.test(css),'Foundation must not use zoom or scale layout workarounds');
assert.ok(css.includes('background:linear-gradient(180deg,rgba(54,207,255,.34),rgba(57,136,255,.24))'),'NEXORA dark scrollbar identity missing');
assert.ok(css.includes('html[data-theme="light"] #appView'),'Independent Light theme foundation missing');
console.log('R5_ADMIN_FOUNDATION_SOURCE_PASS');
console.log('BROWSER_VISUAL_ACCEPTANCE: NOT_RUN. Source checks cannot certify pixel or interaction parity.');

