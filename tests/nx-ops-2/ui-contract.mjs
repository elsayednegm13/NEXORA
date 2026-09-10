import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function assert(cond,msg){if(!cond)throw new Error(msg)}

const html=read('public/admin/index.html'),app=read('public/admin/js/app.js'),router=read('public/admin/js/core/router.js'),state=read('public/admin/js/core/state.js'),module=read('public/admin/js/modules/client-projects.js'),i18n=read('public/admin/js/core/i18n.js'),css=read('public/admin/css/admin.css'),api=read('src/api-router.js');
const views=[...html.matchAll(/data-view-section="([^"]+)"/g)].map(m=>m[1]);assert(JSON.stringify(views)===JSON.stringify(['overview','inquiries','clients','clientProjects','projects','services']),`Admin view order mismatch: ${views.join(',')}`);
assert(html.includes('data-view="clientProjects"')&&html.includes('id="view-client-projects"'),'Client Projects navigation/view missing');
for(const id of ['clientProjectSearch','clientProjectStatusFilter','clientProjectPriorityFilter','addClientProjectBtn','refreshClientProjects','clientProjectsBody','loadMoreClientProjects'])assert(html.includes(`id="${id}"`),`missing Client Project UI id ${id}`);
assert(app.includes("from './modules/client-projects.js'")&&app.includes('clientProjects:loadClientProjects'),'Client Project module not wired');
assert(router.includes("clientProjects:['OPERATIONS / CLIENT PROJECTS',t('clientProjects')]")&&router.includes("'clientProjects'"),'router header/view missing');
assert(state.includes('clientProjects:[]')&&state.includes('activeClientProject:null'),'Client Project state missing');
for(const marker of ['loadClientProjects','openNewClientProject','mountClientProjectDrawer','captureClientProjectDraft','project-service-grid','project-member-grid','projectInquirySearch','confirmDialog'])assert(module.includes(marker),`Client Project UX marker missing: ${marker}`);
for(const key of ['operationsGroup','clientProjects','addClientProject','projectCreated','projectSaved','projectArchived','projectRestored','inquiryLinked']){const count=(i18n.match(new RegExp(`${key}:`,'g'))||[]).length;assert(count===2,`AR/EN translation missing for ${key}: ${count}`)}
for(const marker of ['CLIENT_PROJECT_STATUS_KEYS','CLIENT_PROJECT_PRIORITY_KEYS','clientProjectStatusLabel','clientProjectPriorityLabel'])assert(i18n.includes(marker),`Client Project i18n catalog missing ${marker}`);
for(const marker of ['.project-status-planning','.project-status-active','.project-status-completed','.project-service-grid','.project-member-grid','.project-identity','@media(max-width:560px)'])assert(css.includes(marker),`Client Project responsive CSS missing ${marker}`);
assert(/\.primary-btn\{[^}]*color:white/.test(css),'NEXORA primary CTA white text regressed');
assert(!module.includes('window.confirm(')&&!app.includes('window.confirm('),'native confirm introduced');
for(const forbidden of ['AUTOINCREMENT','foreign key','migration','sequence','database ID'])assert(!module.toLowerCase().includes(forbidden.toLowerCase()),`technical implementation note leaked into Client Project UI: ${forbidden}`);
for(const forbidden of ['view-tasks','view-milestones','view-tickets','view-quotes','view-invoices','view-portal'])assert(!html.includes(forbidden),`future empty view introduced: ${forbidden}`);
for(const forbidden of ['/api/v1/admin/tasks','/api/v1/admin/milestones','/api/v1/admin/tickets','/api/v1/admin/quotes','/api/v1/admin/invoices','/api/v1/client/portal'])assert(!api.includes(forbidden),`future API introduced: ${forbidden}`);
assert(api.includes("/api/v1/admin/client-projects")&&api.includes("/api/v1/admin/client-projects/:id/inquiries/link"),'Client Project API not exposed');
console.log('NX_OPS_2_UI_CONTRACT_PASS');
