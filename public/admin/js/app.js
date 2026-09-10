'use strict';

import { state } from './core/state.js';
import { $, $$, debounce } from './core/dom.js';
import { t, applyStaticI18n, toggleLanguageState } from './core/i18n.js';
import { toggleTheme } from './core/theme.js';
import { api, setUnauthenticatedHandler } from './core/api.js';
import { toast, closeDrawer, closeProjectWorkspace } from './core/ui.js';
import { configureRouter, navigate, updateViewHeader } from './core/router.js';
import { configureAuth, showLogin, showApp } from './core/auth.js';
import { loadOverview, renderOverview, configureOverview } from './modules/overview.js';
import { loadInquiries, renderInquiries, openInquiry, mountInquiryDrawer, configureInquiries, markSynced, renderSyncBadge, liveSyncTick, startLiveSync, stopLiveSync } from './modules/inquiries.js';
import { loadClients, renderClients, openClient, openNewClient, mountClientDrawer, configureClients } from './modules/clients.js';
import { loadClientProjects, renderClientProjects, openClientProject, openNewClientProject, mountClientProjectDrawer, captureClientProjectDraft } from './modules/client-projects.js';
import { loadProjects, renderProjects } from './modules/portfolio-projects.js';
import { loadServices, renderServices } from './modules/services.js';

configureRouter({overview:loadOverview,inquiries:loadInquiries,clients:loadClients,clientProjects:loadClientProjects,projects:loadProjects,services:loadServices});
configureAuth({navigate,startLiveSync,stopLiveSync});
configureOverview({openInquiry,markSynced});
configureClients({openInquiry,openClientProject,openClientProjectsForClient:async c=>{state.clientProjectClientScope={id:Number(c.id),display_name:c.display_name,client_code:c.client_code};closeDrawer();await navigate('clientProjects')}});
configureInquiries({loadOverview,renderOverview,refreshClients:()=>loadClients(),openClient});
setUnauthenticatedHandler(showLogin);

function captureForm(form){
  if(!form)return null;
  const data=Object.fromEntries(new FormData(form));
  for(const el of Array.from(form.elements||[])){
    if(!el?.name)continue;
    if(el.type==='checkbox')data[el.name]=Boolean(el.checked);
  }
  return data;
}
function applyI18n(){
  const drawer=$('#detailDrawer'),drawerOpen=drawer?.classList.contains('is-open');
  const projectWorkspaceOpen=Boolean(state.projectWorkspaceOpen&&!$('#projectWorkspaceLayer')?.hidden);
  const drawerScroll=$('#drawerBody')?.scrollTop||0;
  const inquiryDraft=state.drawerMode==='inquiry'?captureForm($('#inquiryEdit')):null;
  const conversionForm=state.drawerMode==='inquiry'?$('#inquiryConversionForm'):null;
  const conversionDraft=conversionForm?{data:captureForm(conversionForm),search:$('#existingClientSearch')?.value||''}:null;
  const clientDraft=state.drawerMode==='client'?captureForm($('#clientEdit')):null;
  const contactDrafts=state.drawerMode==='client'?$$('.contact-form').map(form=>({key:form.dataset.contactNew==='1'?'new':form.dataset.contactId,data:captureForm(form)})):null;
  const newClientForm=state.drawerMode==='new-client'?$('#newClientForm'):null;
  const newClientDraft=newClientForm?{data:captureForm(newClientForm),toggle:Boolean($('#manualPrimaryToggle')?.checked)}:null;
  const clientProjectDraft=(projectWorkspaceOpen||state.drawerMode==='new-client-project')?captureClientProjectDraft():null;

  applyStaticI18n();
  updateViewHeader();renderSyncBadge();
  if(state.dashboard)renderOverview();
  if(state.inquiries.length||state.view==='inquiries')renderInquiries();
  if(state.clients.length||state.view==='clients')renderClients();
  if(state.clientProjects.length||state.view==='clientProjects')renderClientProjects();
  if(state.projects.length)renderProjects();
  if(state.services.length)renderServices();
  if(projectWorkspaceOpen&&state.activeClientProject){mountClientProjectDrawer(state.activeClientProject,clientProjectDraft);return}
  if(!drawerOpen)return;

  if(state.drawerMode==='inquiry'&&state.activeInquiry){
    mountInquiryDrawer(state.activeInquiry,inquiryDraft,conversionDraft);
  }else if(state.drawerMode==='client'&&state.activeClient){
    void mountClientDrawer(state.activeClient,clientDraft,contactDrafts).then(()=>{if($('#drawerBody'))$('#drawerBody').scrollTop=drawerScroll});
  }else if(state.drawerMode==='new-client'){
    void openNewClient(newClientDraft).then(()=>{if($('#drawerBody'))$('#drawerBody').scrollTop=drawerScroll});
  }else if(state.drawerMode==='new-client-project'){
    void openNewClientProject(clientProjectDraft).then(()=>{if($('#drawerBody'))$('#drawerBody').scrollTop=drawerScroll});
  }
  requestAnimationFrame(()=>{if($('#drawerBody'))$('#drawerBody').scrollTop=drawerScroll});
}
function toggleLang(){toggleLanguageState();applyI18n()}

async function boot(){
  applyI18n();
  try{
    const setup=await api('/admin/setup/status');$('#setupLink').hidden=!setup.setup_enabled;
    try{const me=await api('/admin/auth/me');state.user=me.user;state.csrf=me.csrf_token;showApp()}catch(e){showLogin()}
  }catch(e){showLogin(e.message)}
}

$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').hidden=true;const btn=$('button[type=submit]',e.currentTarget);btn.disabled=true;try{const d=await api('/admin/auth/login',{method:'POST',body:{email:$('#loginEmail').value.trim(),password:$('#loginPassword').value}});state.user=d.user;state.csrf=d.csrf_token;showApp()}catch(err){$('#loginError').textContent=err.code==='ADMIN_LOGIN_INVALID'?t('loginError'):err.message;$('#loginError').hidden=false}finally{btn.disabled=false}});
$('#logoutBtn').addEventListener('click',async()=>{try{await api('/admin/auth/logout',{method:'POST',csrf:true});state.user=null;state.csrf='';showLogin()}catch(e){toast(e.message,'error')}});
$$('.nav-item[data-view]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.view==='clientProjects')state.clientProjectClientScope=null;navigate(b.dataset.view)}));
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));
$('#langBtn').addEventListener('click',toggleLang);$('#authLangBtn').addEventListener('click',toggleLang);$('#themeBtn').addEventListener('click',toggleTheme);$('#projectWorkspaceLang')?.addEventListener('click',toggleLang);$('#projectWorkspaceTheme')?.addEventListener('click',toggleTheme);
$('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('is-open'));
$('#drawerClose').addEventListener('click',closeDrawer);$('#drawerBackdrop').addEventListener('click',closeDrawer);$('#projectWorkspaceClose')?.addEventListener('click',closeProjectWorkspace);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(state.projectWorkspaceOpen)closeProjectWorkspace();else closeDrawer()}});
$('#refreshInquiries').addEventListener('click',async()=>{await loadInquiries();await loadOverview()});
$('#inquiryStatusFilter').addEventListener('change',loadInquiries);$('#inquirySearch').addEventListener('input',debounce(loadInquiries));
$('#refreshClients').addEventListener('click',()=>loadClients());$('#clientStatusFilter').addEventListener('change',()=>loadClients());$('#clientSearch').addEventListener('input',debounce(()=>loadClients()));$('#addClientBtn').addEventListener('click',openNewClient);$('#loadMoreClients').addEventListener('click',()=>loadClients({append:true}));
$('#refreshClientProjects').addEventListener('click',()=>loadClientProjects());$('#clientProjectStatusFilter').addEventListener('change',()=>loadClientProjects());$('#clientProjectPriorityFilter').addEventListener('change',()=>loadClientProjects());$('#clientProjectSearch').addEventListener('input',debounce(()=>loadClientProjects()));$('#addClientProjectBtn').addEventListener('click',openNewClientProject);$('#loadMoreClientProjects').addEventListener('click',()=>loadClientProjects({append:true}));
$('#refreshProjects').addEventListener('click',loadProjects);$('#refreshServices').addEventListener('click',loadServices);
window.addEventListener('hashchange',()=>state.user&&navigate(location.hash.replace('#',''),false));
window.addEventListener('focus',()=>state.user&&liveSyncTick());
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.user)liveSyncTick()});

boot();
