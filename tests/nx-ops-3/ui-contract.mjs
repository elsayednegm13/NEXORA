import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
function assert(cond,msg){if(!cond)throw new Error(msg)}

const clients=read('public/admin/js/modules/clients.js');
const clientProjects=read('public/admin/js/modules/client-projects.js');
const app=read('public/admin/js/app.js');
const state=read('public/admin/js/core/state.js');
const html=read('public/admin/index.html');
const setupHtml=read('public/admin/setup.html');
const icons=read('public/admin/js/core/icons.js');
const i18n=read('public/admin/js/core/i18n.js');
const css=read('public/admin/css/admin.css');

// Client detail -> Client Projects navigation requested by owner.
for(const marker of [
  'function clientProjectsSection(c)',
  'data-open-client-project',
  'data-open-client-projects',
  'openClientProjectHandler',
  'openClientProjectsForClientHandler',
  "t('viewAllClientProjects')",
  "t('noClientProjectsForClient')"
]) assert(clients.includes(marker),`client drawer project navigation missing: ${marker}`);
assert(clients.indexOf('${clientProjectsSection(c)}') < clients.indexOf('${profileCompletionSection(c)}'),'client project section should be visible before profile-completion controls');
for(const marker of [
  'clientProjectClientScope:null',
  "state.clientProjectClientScope={id:Number(c.id),display_name:c.display_name,client_code:c.client_code}",
  "await navigate('clientProjects')",
  "state.clientProjectClientScope=null"
]) assert((state+'\n'+app).includes(marker),`client project scope navigation missing: ${marker}`);
assert(html.includes('id="clientProjectScopeBar"'),'Client Projects scoped-client bar missing');
for(const marker of ['client_id', 'data-clear-client-project-scope', "t('clientProjectsScope')", "t('showAllProjects')"])
  assert(clientProjects.includes(marker),`Client Projects client-scope UI missing: ${marker}`);

// Project execution workspace.
for(const marker of [
  'function executionSection(p)',
  'id="projectExecutionRoot"',
  "let lastExecutionTab='milestones'",
  'function milestoneEditor(',
  'function taskEditor(',
  'data-new-milestone="1"',
  'data-new-task="1"',
  'data-milestone-lifecycle',
  'data-task-lifecycle',
  '/execution/summary',
  '/execution/progress-mode',
  '/milestones',
  '/tasks',
  'effective_progress_percent',
  'task-assignee-grid'
]) assert(clientProjects.includes(marker),`Project execution UI contract missing: ${marker}`);

// Task assignment is intentionally limited to existing project members in the UI.
assert(clientProjects.includes('(p.members||[]).filter'),'task assignee picker is not sourced from project members');
assert(clientProjects.includes('name="assignee_'),'task assignee checkboxes missing');
for(const marker of [
  'task-assignee-card',
  'data-task-assignee-card',
  'task-assignee-person',
  'task-assignee-copy',
  'task-assignee-name-row',
  'task-assignee-lead',
  'task-assignee-input',
  'data-task-assignee',
  "t('projectLead')"
]) assert(clientProjects.includes(marker),`task assignee row-card contract missing: ${marker}`);
assert(clientProjects.includes("const sync=()=>input.closest('[data-task-assignee-card]')?.classList.toggle('is-selected',input.checked)"),'task assignee selected-state binding missing');
// Approved Project Execution visual board: stage grouping, compact task cards and derived visual status.
for(const marker of [
  'function taskVisualState(task)',
  'function milestoneVisualState(m)',
  'function executionStatusPill(kind,item)',
  'function taskStageGroups(tasks,milestones)',
  'function taskStageCard(group,p,milestones,config,index)',
  'task-stage-group',
  'task-visual-card',
  'execution-status-pill',
  "{key:'done',label:t('completedTasks')",
  "{key:'overdue',label:t('overdueTasks')",
  'data-new-task-shell'
]) assert(clientProjects.includes(marker),`Project Execution visual board contract missing: ${marker}`);
assert(clientProjects.includes("if(task?.due_date&&task.due_date<executionToday())return 'overdue'"),'derived overdue task visual state missing');
assert(clientProjects.includes("if(m?.target_date&&m.target_date<executionToday())return 'overdue'"),'derived overdue milestone visual state missing');
assert(clientProjects.includes("mountClientProjectDrawer(fresh,{execution:{tab:lastExecutionTab,newTaskOpen:false,newMilestoneOpen:false}})"),'post-save create forms are not collapsed after refresh');
assert(clientProjects.includes("newTaskOpen:Boolean($('[data-new-task]')?.closest('details')?.open)"),'new task open-state draft capture missing');
assert(clientProjects.includes("if(newTaskShell)newTaskShell.open=Boolean(draft.newTaskOpen)"),'new task open-state draft restore missing');



// NEXORA Admin icon standard: pinned Font Awesome with a local fallback glyph contract.
for(const page of [html,setupHtml]) assert(page.includes('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.1/js/all.min.js'),'Font Awesome 7.3.1 Admin runtime missing');
for(const marker of ['fa-solid','fa-diagram-project','fa-magnifying-glass']) assert(html.includes(marker),`Admin Font Awesome shell icon missing: ${marker}`);
for(const marker of ['export function faIcon','export function executionStateIcon','circle-check','arrows-rotate','triangle-exclamation','ban','box-archive']) assert(icons.includes(marker),`Font Awesome icon helper contract missing: ${marker}`);
for(const marker of ['function taskStageDistribution(tasks)','task-stage-status-visual','task-meta-chip','task-card-actions',"faIcon('layer-group'","faIcon('list-check'"]) assert(clientProjects.includes(marker),`refined execution visual contract missing: ${marker}`);
for(const marker of ['.nexora-fa{','.task-stage-status-map{','.task-stage-status-segment.status-done','.task-stage-status-segment.status-overdue','.task-stage-cards{display:grid;grid-template-columns:repeat(2','.task-visual-card[open]{grid-column:1/-1','.task-meta-chip{']) assert(css.includes(marker),`Font Awesome/refined execution CSS missing: ${marker}`);

// AR/EN contract: every new visitor-facing key appears in both locale blocks.
const keys=[
  'viewAllClientProjects','noClientProjectsForClient','clientProjectsScope','showAllProjects',
  'projectExecution','executionSummary','progressMode','progressManual','progressCalculated',
  'calculatedProgress','totalTasks','completedTasks','inProgressTasks','blockedTasks','overdueTasks',
  'milestones','tasks','addMilestone','addTask','milestoneTitle','milestoneDescription','milestoneStatus',
  'milestoneTarget','milestoneSort','taskTitle','taskDescription','taskStatus','taskPriority','taskMilestone',
  'taskAssignees','taskStart','taskDue','taskSort','noMilestones','noTasks','milestoneCreated','milestoneSaved',
  'milestoneArchived','milestoneRestored','taskCreated','taskSaved','taskArchived','taskRestored',
  'archiveMilestone','restoreMilestone','archiveTask','restoreTask','progressModeSaved','noMilestone','nextMilestone','taskAssigneeHint',
  'addMilestoneHint','addTaskHint','ungroupedTasksHint','noTasksInStage'
];
for(const key of keys){
  const matches=[...i18n.matchAll(new RegExp(`\\b${key}:`,'g'))];
  assert(matches.length===2,`expected AR+EN i18n key exactly twice: ${key}; found ${matches.length}`);
}
for(const marker of ['milestoneStatusLabel','taskStatusLabel','taskPriorityLabel','executionProgressModeLabel']) assert(i18n.includes(marker),`execution label helper missing: ${marker}`);

// Theme/responsive and accepted CTA/confirmation standards.
for(const marker of [
  '.client-project-scope-bar{',
  '.client-project-mini-card{',
  '.project-execution-root{',
  '.execution-summary{',
  '.execution-tabs{',
  '.task-assignee-grid{',
  '.task-assignee-card{',
  '.task-assignee-person{',
  '.task-assignee-name-row{',
  '.task-assignee-lead{',
  '.task-assignee-input{',
  'html[dir="rtl"] .task-assignee-card.is-selected',
  'html[data-theme="light"] .task-assignee-card',
  'html[data-theme="light"] .client-project-mini-card',
  '.task-stage-group{',
  '.task-stage-head{',
  '.task-visual-card{',
  '.task-visual-summary{',
  '.execution-status-pill{',
  '.execution-stat-done{',
  '.execution-stat-overdue{',
  'html[data-theme="light"] .task-visual-card',
  '@media(max-width:1100px)',
  '@media(max-width:700px)'
]) assert(css.includes(marker),`responsive/theme CSS contract missing: ${marker}`);
assert(/\.primary-btn\{[^}]*color:(?:white|#fff);/.test(css),'Admin primary CTA white-text standard regressed');
assert(!/window\.confirm\s*\(/.test(clients+'\n'+clientProjects+'\n'+app),'native window.confirm introduced');
assert(clientProjects.includes('confirmDialog'),'themed execution confirmation dialog missing');
for(const marker of ['function captureExecutionDraft()','function restoreExecutionDraft(root,draft)','execution:captureExecutionDraft()','restoreExecutionDraft(root,draft)'])
  assert(clientProjects.includes(marker),`execution language-switch draft preservation missing: ${marker}`);


// Font Awesome HTML helpers are trusted static markup; only user/content values are escaped.
// Regression guard for R5 inquiry-detail bug where icon markup was rendered literally to users.
const inquiryUi=read('public/admin/js/modules/inquiries.js');
assert(!/esc\s*\(\s*(?:faIcon|detailIcon|executionStateIcon)\s*\(/.test(inquiryUi),'Font Awesome helper markup must not be HTML-escaped in Inquiry UI');
assert(inquiryUi.includes('${detailIcon(kind)}'),'Inquiry detail cards must render detailIcon(kind) as markup');
assert(!inquiryUi.includes('${esc(detailIcon(kind))}'),'Inquiry detail cards still escape Font Awesome markup');

console.log('NX_OPS_3_UI_CONTRACT_PASS');
