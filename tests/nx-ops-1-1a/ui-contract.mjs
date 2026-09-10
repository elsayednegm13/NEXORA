import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};

const clients=read('public/admin/js/modules/clients.js');
const inquiries=read('public/admin/js/modules/inquiries.js');
const ui=read('public/admin/js/core/ui.js');
const css=read('public/admin/css/admin.css');
const i18n=read('public/admin/js/core/i18n.js');
const server=read('src/modules/operations/clients.js');
const router=read('src/api-router.js');

assert(!/name=["']client_code["']/.test(clients),'Client form still exposes editable client_code');
assert(!/name=["']client_code["']/.test(inquiries),'Inquiry conversion still exposes editable client_code');
assert(clients.includes('clientCodeAutoHint')&&inquiries.includes('clientCodeAutoHint'),'automatic code hint missing');
assert(clients.includes('data-tax-field')&&inquiries.includes('data-conversion-tax'),'conditional tax fields missing');
assert(clients.includes("d.client_type==='individual'"),'UI payload does not clear individual tax');
assert(server.includes("tax_identifier:clientType==='company'"),'server company-only tax rule missing');
assert(server.includes("printf('%03d', id)"),'server deterministic Client Code allocator missing');
assert(!/SET\s+client_code=\?/i.test(server),'general edit still mutates client_code');
assert(server.includes('adminClientLifecycle')&&server.includes('CLIENT_LIFECYCLE_TRANSITIONS'),'lifecycle service missing');
assert(server.includes('adminClientDelete')&&server.includes('clientDeleteBlockers'),'guarded delete service missing');
assert(router.includes("/api/v1/admin/clients/:id/lifecycle")&&router.includes("/api/v1/admin/clients/:id/delete"),'lifecycle/delete API routes missing');
assert(!/method==='DELETE'/.test(router),'generic DELETE HTTP route should not be exposed');
assert(ui.includes('confirmDialog')&&ui.includes('aria-modal="true"'),'themed accessible confirmation dialog missing');
assert(!clients.includes('window.confirm')&&!inquiries.includes('window.confirm'),'native browser confirm introduced');
for(const marker of ['select.select-input option','html[data-theme="light"] select.select-input','.readonly-control','.danger-btn','.nexora-confirm-layer','html[data-theme="light"] .nexora-confirm','@media(max-width:560px)'])assert(css.includes(marker),`theme/responsive CSS marker missing: ${marker}`);
for(const key of ['clientCodeAutoHint','clearTaxTitle','clientLifecycle','deactivateClient','activateClient','archiveClient','restoreClient','deleteClient','deletePermanently','typeClientCode','clientDeleted'])assert(i18n.includes(`${key}:`),`i18n key missing: ${key}`);
console.log('NX_OPS_1_1A_UI_CONTRACT_PASS');
