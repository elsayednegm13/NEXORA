'use strict';

import { ApiError } from './core/errors.js';
import { dataResponse } from './core/http.js';
import { requireAdmin } from './core/auth-admin.js';
import { match } from './core/router.js';
import { listServices, showService } from './modules/public/services.js';
import { listProjects, showProject } from './modules/public/projects.js';
import { inquiryConfig, createInquiry } from './modules/inquiries/public.js';
import { adminSetupStatus, adminSetup, adminLogin, adminMe, adminLogout } from './modules/admin/auth.js';
import { adminDashboard } from './modules/admin/dashboard.js';
import { adminInquiryList, adminInquiryFind, adminInquiryUpdate } from './modules/admin/inquiries.js';
import { adminProjectList, adminProjectUpdate } from './modules/cms/projects-admin.js';
import { adminServiceList, adminServiceUpdate } from './modules/cms/services-admin.js';
import { adminClientConfig, adminClientList, adminClientFind, adminClientCreate, adminClientUpdate, adminClientLifecycle, adminClientDelete, adminClientContactCreate, adminClientContactUpdate, adminInquiryConvertToClient } from './modules/operations/clients.js';
import { adminClientProfileCompletionState, adminClientProfileCompletionGenerate, adminClientProfileCompletionRevoke, publicClientProfileResolve, publicClientProfileComplete } from './modules/operations/client-profile.js';
import { adminClientProjectConfig, adminClientProjectList, adminClientProjectFind, adminClientProjectCreate, adminClientProjectUpdate, adminClientProjectLifecycle, adminClientProjectInquiryOptions, adminClientProjectInquiryLink } from './modules/operations/client-projects.js';
import { adminClientProjectExecutionSummary, adminClientProjectMilestoneList, adminClientProjectMilestoneCreate, adminClientProjectMilestoneUpdate, adminClientProjectMilestoneLifecycle, adminClientProjectTaskList, adminClientProjectTaskCreate, adminClientProjectTaskUpdate, adminClientProjectTaskLifecycle, adminClientProjectProgressMode } from './modules/operations/client-project-execution.js';
import { adminClientProjectSupportConfig, adminClientProjectAccessState, adminClientProjectAccessGenerate, adminClientProjectAccessRevoke, adminClientProjectTicketList, adminClientProjectTicketFind, adminClientProjectTicketCreate, adminClientProjectTicketUpdate, adminClientProjectTicketMessageCreate, adminClientProjectTicketLifecycle, adminClientProjectRealtime, publicClientPortalRealtime, publicClientPortalExchange, publicClientPortalSession, publicClientPortalLogout, publicClientPortalProject, publicClientPortalTicketList, publicClientPortalTicketFind, publicClientPortalTicketCreate, publicClientPortalTicketMessageCreate } from './modules/operations/client-project-support.js';
import { adminClientProjectFileList, adminClientProjectFolderCreate, adminClientProjectFileUpload, adminClientProjectFileUpdate, adminClientProjectFileLifecycle, adminClientProjectFileContent, publicClientPortalTicketFileUpload, publicClientPortalFileContent } from './modules/operations/client-project-files.js';

export async function handleApi(request, env, rid) {
  const url=new URL(request.url);const path=(url.pathname.replace(/\/+$/,'')||'/');const method=request.method.toUpperCase();
  if(method==='OPTIONS')return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});

  if(method==='GET'&&path==='/api/v1/health')return dataResponse({status:'UP',service:'nexora-worker',api:'v1',runtime:'cloudflare-workers'});
  if (!env.DB) throw new ApiError('DATABASE_UNAVAILABLE','D1 binding DB is not configured.',503);
  if(method==='GET'&&path==='/api/v1/health/db'){await env.DB.prepare('SELECT 1 ok').first();return dataResponse({status:'UP',database:'Cloudflare D1'});}
  if(method==='GET'&&path==='/api/v1/services')return dataResponse(await listServices(env));
  let p=match(path,'/api/v1/services/:slug');if(method==='GET'&&p)return dataResponse(await showService(env,p.slug));
  if(method==='GET'&&path==='/api/v1/projects')return dataResponse(await listProjects(env));
  p=match(path,'/api/v1/projects/:slug');if(method==='GET'&&p)return dataResponse(await showProject(env,p.slug));
  if(method==='GET'&&path==='/api/v1/project-inquiries/config')return dataResponse(await inquiryConfig(env));
  if(method==='POST'&&path==='/api/v1/project-inquiries'){const r=await createInquiry(request,env);return dataResponse(r.data,r.status);}
  if(method==='POST'&&path==='/api/v1/client-profile/resolve')return dataResponse(await publicClientProfileResolve(request,env));
  if(method==='POST'&&path==='/api/v1/client-profile/complete')return dataResponse(await publicClientProfileComplete(request,env,rid));
  if(method==='POST'&&path==='/api/v1/client-portal/exchange')return publicClientPortalExchange(request,env,rid);
  if(method==='GET'&&path==='/api/v1/client-portal/session')return dataResponse(await publicClientPortalSession(request,env));
  if(method==='POST'&&path==='/api/v1/client-portal/logout')return publicClientPortalLogout(request,env);
  if(method==='GET'&&path==='/api/v1/client-portal/project')return dataResponse(await publicClientPortalProject(request,env));
  if(method==='GET'&&path==='/api/v1/client-portal/realtime')return publicClientPortalRealtime(request,env);
  if(method==='GET'&&path==='/api/v1/client-portal/tickets')return dataResponse(await publicClientPortalTicketList(request,env));
  if(method==='POST'&&path==='/api/v1/client-portal/tickets')return dataResponse(await publicClientPortalTicketCreate(request,env,rid),201);
  p=match(path,'/api/v1/client-portal/tickets/:publicId');if(method==='GET'&&p)return dataResponse(await publicClientPortalTicketFind(request,env,p.publicId));
  p=match(path,'/api/v1/client-portal/tickets/:publicId/messages');if(method==='POST'&&p)return dataResponse(await publicClientPortalTicketMessageCreate(request,env,p.publicId,rid),201);
  p=match(path,'/api/v1/client-portal/tickets/:publicId/files');if(method==='POST'&&p)return dataResponse(await publicClientPortalTicketFileUpload(request,env,p.publicId,rid),201);
  p=match(path,'/api/v1/client-portal/files/:filePublicId');if(method==='GET'&&p)return publicClientPortalFileContent(request,env,p.filePublicId);

  if(method==='GET'&&path==='/api/v1/admin/setup/status')return dataResponse(await adminSetupStatus(env));
  if(method==='POST'&&path==='/api/v1/admin/setup')return adminSetup(request,env,rid);
  if(method==='POST'&&path==='/api/v1/admin/auth/login')return adminLogin(request,env,rid);
  if(method==='GET'&&path==='/api/v1/admin/auth/me')return dataResponse(await adminMe(request,env));
  if(method==='POST'&&path==='/api/v1/admin/auth/logout')return adminLogout(request,env,rid);
  if(method==='GET'&&path==='/api/v1/admin/dashboard'){await requireAdmin(request,env);return dataResponse(await adminDashboard(env));}
  if(method==='GET'&&path==='/api/v1/admin/inquiries'){await requireAdmin(request,env);return dataResponse(await adminInquiryList(env,url));}
  p=match(path,'/api/v1/admin/inquiries/:id');if(method==='GET'&&p){await requireAdmin(request,env);const item=await adminInquiryFind(env,Number(p.id));if(!item)throw new ApiError('ADMIN_INQUIRY_NOT_FOUND','Inquiry not found.',404);return dataResponse(item);}
  p=match(path,'/api/v1/admin/inquiries/:id/update');if(method==='POST'&&p)return dataResponse(await adminInquiryUpdate(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/inquiries/:id');if(method==='PATCH'&&p)return dataResponse(await adminInquiryUpdate(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/inquiries/:id/convert-client');if(method==='POST'&&p)return dataResponse(await adminInquiryConvertToClient(request,env,Number(p.id),rid));
  if(method==='GET'&&path==='/api/v1/admin/clients/config'){await requireAdmin(request,env);return dataResponse(await adminClientConfig(env));}
  if(method==='GET'&&path==='/api/v1/admin/clients'){await requireAdmin(request,env);return dataResponse(await adminClientList(env,url));}
  if(method==='POST'&&path==='/api/v1/admin/clients')return dataResponse(await adminClientCreate(request,env,rid),201);
  p=match(path,'/api/v1/admin/clients/:id');if(method==='GET'&&p){await requireAdmin(request,env);const item=await adminClientFind(env,Number(p.id));if(!item)throw new ApiError('CLIENT_NOT_FOUND','Client not found.',404);return dataResponse(item);}
  p=match(path,'/api/v1/admin/clients/:id/update');if(method==='POST'&&p)return dataResponse(await adminClientUpdate(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/clients/:id');if(method==='PATCH'&&p)return dataResponse(await adminClientUpdate(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/clients/:id/lifecycle');if(method==='POST'&&p)return dataResponse(await adminClientLifecycle(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/clients/:id/delete');if(method==='POST'&&p)return dataResponse(await adminClientDelete(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/clients/:id/profile-completion');if(method==='GET'&&p){await requireAdmin(request,env);return dataResponse(await adminClientProfileCompletionState(env,Number(p.id)));}
  p=match(path,'/api/v1/admin/clients/:id/profile-completion/generate');if(method==='POST'&&p)return dataResponse(await adminClientProfileCompletionGenerate(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/clients/:id/profile-completion/revoke');if(method==='POST'&&p)return dataResponse(await adminClientProfileCompletionRevoke(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/clients/:id/contacts');if(method==='POST'&&p)return dataResponse(await adminClientContactCreate(request,env,Number(p.id),rid),201);
  p=match(path,'/api/v1/admin/clients/:id/contacts/:contactId/update');if(method==='POST'&&p)return dataResponse(await adminClientContactUpdate(request,env,Number(p.id),Number(p.contactId),rid));
  p=match(path,'/api/v1/admin/clients/:id/contacts/:contactId');if(method==='PATCH'&&p)return dataResponse(await adminClientContactUpdate(request,env,Number(p.id),Number(p.contactId),rid));
  if(method==='GET'&&path==='/api/v1/admin/client-projects/config'){await requireAdmin(request,env);return dataResponse(await adminClientProjectConfig(env));}
  if(method==='GET'&&path==='/api/v1/admin/client-projects'){await requireAdmin(request,env);return dataResponse(await adminClientProjectList(env,url));}
  if(method==='POST'&&path==='/api/v1/admin/client-projects')return dataResponse(await adminClientProjectCreate(request,env,rid),201);
  p=match(path,'/api/v1/admin/client-projects/:id');if(method==='GET'&&p){await requireAdmin(request,env);const item=await adminClientProjectFind(env,Number(p.id));if(!item)throw new ApiError('CLIENT_PROJECT_NOT_FOUND','Client Project not found.',404);return dataResponse(item);}
  p=match(path,'/api/v1/admin/client-projects/:id/update');if(method==='POST'&&p)return dataResponse(await adminClientProjectUpdate(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/client-projects/:id');if(method==='PATCH'&&p)return dataResponse(await adminClientProjectUpdate(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/client-projects/:id/lifecycle');if(method==='POST'&&p)return dataResponse(await adminClientProjectLifecycle(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/client-projects/:id/inquiry-options');if(method==='GET'&&p){await requireAdmin(request,env);return dataResponse(await adminClientProjectInquiryOptions(env,Number(p.id),url));}
  p=match(path,'/api/v1/admin/client-projects/:id/inquiries/link');if(method==='POST'&&p)return dataResponse(await adminClientProjectInquiryLink(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/client-projects/:id/execution/summary');if(method==='GET'&&p){await requireAdmin(request,env);return dataResponse(await adminClientProjectExecutionSummary(env,Number(p.id)));}
  p=match(path,'/api/v1/admin/client-projects/:id/execution/progress-mode');if(method==='POST'&&p)return dataResponse(await adminClientProjectProgressMode(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/client-projects/:id/milestones');if(method==='GET'&&p){await requireAdmin(request,env);return dataResponse(await adminClientProjectMilestoneList(env,Number(p.id)));}
  p=match(path,'/api/v1/admin/client-projects/:id/milestones');if(method==='POST'&&p)return dataResponse(await adminClientProjectMilestoneCreate(request,env,Number(p.id),rid),201);
  p=match(path,'/api/v1/admin/client-projects/:id/milestones/:milestoneId/update');if(method==='POST'&&p)return dataResponse(await adminClientProjectMilestoneUpdate(request,env,Number(p.id),Number(p.milestoneId),rid));
  p=match(path,'/api/v1/admin/client-projects/:id/milestones/:milestoneId/lifecycle');if(method==='POST'&&p)return dataResponse(await adminClientProjectMilestoneLifecycle(request,env,Number(p.id),Number(p.milestoneId),rid));
  p=match(path,'/api/v1/admin/client-projects/:id/tasks');if(method==='GET'&&p){await requireAdmin(request,env);return dataResponse(await adminClientProjectTaskList(env,Number(p.id),url));}
  p=match(path,'/api/v1/admin/client-projects/:id/tasks');if(method==='POST'&&p)return dataResponse(await adminClientProjectTaskCreate(request,env,Number(p.id),rid),201);
  p=match(path,'/api/v1/admin/client-projects/:id/tasks/:taskId/update');if(method==='POST'&&p)return dataResponse(await adminClientProjectTaskUpdate(request,env,Number(p.id),Number(p.taskId),rid));
  p=match(path,'/api/v1/admin/client-projects/:id/tasks/:taskId/lifecycle');if(method==='POST'&&p)return dataResponse(await adminClientProjectTaskLifecycle(request,env,Number(p.id),Number(p.taskId),rid));
  p=match(path,'/api/v1/admin/client-projects/:id/support/config');if(method==='GET'&&p){await requireAdmin(request,env);return dataResponse(await adminClientProjectSupportConfig(env,Number(p.id)));}
  p=match(path,'/api/v1/admin/client-projects/:id/realtime');if(method==='GET'&&p)return adminClientProjectRealtime(request,env,Number(p.id));
  p=match(path,'/api/v1/admin/client-projects/:id/portal-access');if(method==='GET'&&p){await requireAdmin(request,env);return dataResponse(await adminClientProjectAccessState(env,Number(p.id)));}
  p=match(path,'/api/v1/admin/client-projects/:id/portal-access/generate');if(method==='POST'&&p)return dataResponse(await adminClientProjectAccessGenerate(request,env,Number(p.id),rid),201);
  p=match(path,'/api/v1/admin/client-projects/:id/portal-access/:grantId/revoke');if(method==='POST'&&p)return dataResponse(await adminClientProjectAccessRevoke(request,env,Number(p.id),Number(p.grantId),rid));
  p=match(path,'/api/v1/admin/client-projects/:id/tickets');if(method==='GET'&&p){await requireAdmin(request,env);return dataResponse(await adminClientProjectTicketList(env,Number(p.id),url));}
  p=match(path,'/api/v1/admin/client-projects/:id/tickets');if(method==='POST'&&p)return dataResponse(await adminClientProjectTicketCreate(request,env,Number(p.id),rid),201);
  p=match(path,'/api/v1/admin/client-projects/:id/tickets/:ticketId');if(method==='GET'&&p){await requireAdmin(request,env);return dataResponse(await adminClientProjectTicketFind(env,Number(p.id),Number(p.ticketId)));}
  p=match(path,'/api/v1/admin/client-projects/:id/tickets/:ticketId/update');if(method==='POST'&&p)return dataResponse(await adminClientProjectTicketUpdate(request,env,Number(p.id),Number(p.ticketId),rid));
  p=match(path,'/api/v1/admin/client-projects/:id/tickets/:ticketId/messages');if(method==='POST'&&p)return dataResponse(await adminClientProjectTicketMessageCreate(request,env,Number(p.id),Number(p.ticketId),rid),201);
  p=match(path,'/api/v1/admin/client-projects/:id/tickets/:ticketId/lifecycle');if(method==='POST'&&p)return dataResponse(await adminClientProjectTicketLifecycle(request,env,Number(p.id),Number(p.ticketId),rid));
  p=match(path,'/api/v1/admin/client-projects/:id/files');if(method==='GET'&&p){await requireAdmin(request,env);return dataResponse(await adminClientProjectFileList(env,Number(p.id),url));}
  p=match(path,'/api/v1/admin/client-projects/:id/files/upload');if(method==='POST'&&p)return dataResponse(await adminClientProjectFileUpload(request,env,Number(p.id),rid,url),201);
  p=match(path,'/api/v1/admin/client-projects/:id/folders');if(method==='POST'&&p)return dataResponse(await adminClientProjectFolderCreate(request,env,Number(p.id),rid),201);
  p=match(path,'/api/v1/admin/client-projects/:id/files/:fileId/update');if(method==='POST'&&p)return dataResponse(await adminClientProjectFileUpdate(request,env,Number(p.id),Number(p.fileId),rid));
  p=match(path,'/api/v1/admin/client-projects/:id/files/:fileId/lifecycle');if(method==='POST'&&p)return dataResponse(await adminClientProjectFileLifecycle(request,env,Number(p.id),Number(p.fileId),rid));
  p=match(path,'/api/v1/admin/client-projects/:id/files/:fileId/content');if(method==='GET'&&p)return adminClientProjectFileContent(request,env,Number(p.id),Number(p.fileId));
  if(method==='GET'&&path==='/api/v1/admin/projects'){await requireAdmin(request,env);return dataResponse(await adminProjectList(env));}
  p=match(path,'/api/v1/admin/projects/:id/update');if(method==='POST'&&p)return dataResponse(await adminProjectUpdate(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/projects/:id');if(method==='PATCH'&&p)return dataResponse(await adminProjectUpdate(request,env,Number(p.id),rid));
  if(method==='GET'&&path==='/api/v1/admin/services'){await requireAdmin(request,env);return dataResponse(await adminServiceList(env));}
  p=match(path,'/api/v1/admin/services/:id/update');if(method==='POST'&&p)return dataResponse(await adminServiceUpdate(request,env,Number(p.id),rid));
  p=match(path,'/api/v1/admin/services/:id');if(method==='PATCH'&&p)return dataResponse(await adminServiceUpdate(request,env,Number(p.id),rid));

  throw new ApiError('API_ROUTE_NOT_FOUND','API route not found.',404);
}
