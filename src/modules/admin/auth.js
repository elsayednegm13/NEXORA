'use strict';

import { ApiError } from '../../core/errors.js';
import { dataResponse, clientIp, readJson } from '../../core/http.js';
import { isEmail, intVar, bool } from '../../core/validation.js';
import { constantTimeEqualText } from '../../core/crypto.js';
import { hashPassword, verifyPassword, sessionToken, csrfFor, adminCookie, clearAdminCookie, requireAdmin, requireCsrf, assertSameOrigin } from '../../core/auth-admin.js';
import { audit } from '../../core/audit.js';
import { rateAllow } from '../../core/rate-limit.js';

export async function adminSetupStatus(env){
  const row=await env.DB.prepare('SELECT COUNT(*) count FROM admin_users').first(); const count=Number(row?.count||0); const key=String(env.ADMIN_SETUP_KEY||''); const pepper=String(env.ADMIN_PASSWORD_PEPPER||'');
  return {configured:count>0,setup_enabled:count===0&&key.length>=24&&!key.toUpperCase().includes('CHANGE_THIS')&&pepper.length>=32};
}

export async function adminSetup(request,env,rid){
  assertSameOrigin(request);
  const status=await adminSetupStatus(env); if(status.configured)throw new ApiError('ADMIN_ALREADY_CONFIGURED','Admin account is already configured.',409);
  if(!status.setup_enabled)throw new ApiError('ADMIN_SETUP_DISABLED','Set a strong ADMIN_SETUP_KEY Worker secret first.',503);
  const d=await readJson(request,env); const provided=String(d.setup_key||'').trim();
  if(!provided||!(await constantTimeEqualText(String(env.ADMIN_SETUP_KEY),provided)))throw new ApiError('ADMIN_SETUP_KEY_INVALID','Setup key is invalid.',403);
  const name=String(d.name||'').trim(), email=String(d.email||'').trim().toLowerCase(), password=String(d.password||'');
  if(name.length<2||name.length>190)throw new ApiError('ADMIN_NAME_INVALID','Name, email or password does not meet the setup requirements.',422);
  if(!isEmail(email))throw new ApiError('ADMIN_EMAIL_INVALID','Name, email or password does not meet the setup requirements.',422);
  if(password.length<12||password.length>200)throw new ApiError('ADMIN_PASSWORD_INVALID','Name, email or password does not meet the setup requirements.',422);
  const passwordHash=await hashPassword(password,env);
  try{await env.DB.prepare(`INSERT INTO admin_users(name,email,password_hash,is_active,created_at,updated_at) VALUES(?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(name,email,passwordHash).run();}
  catch(err){throw new ApiError('ADMIN_ALREADY_CONFIGURED','Admin account is already configured.',409);}
  const admin=await env.DB.prepare('SELECT id,name,email FROM admin_users WHERE email=? LIMIT 1').bind(email).first();
  await audit(env,{adminId:Number(admin.id),action:'admin.setup',entityType:'admin_user',entityId:String(admin.id),rid,ip:clientIp(request)});
  const ttl=intVar(env,'ADMIN_SESSION_TIMEOUT_SECONDS',28800,900,86400*7); const s=await sessionToken(env,Number(admin.id),ttl); const csrf=await csrfFor(env,s.payload.nonce);
  return dataResponse({user:{id:Number(admin.id),name:admin.name,email:admin.email},csrf_token:csrf},201,{'Set-Cookie':adminCookie(s.token,ttl)});
}

export async function adminLogin(request,env,rid){
  assertSameOrigin(request); const ip=clientIp(request);
  const limit=intVar(env,'ADMIN_LOGIN_RATE_LIMIT',8,3,100), windowSeconds=intVar(env,'ADMIN_LOGIN_RATE_WINDOW_SECONDS',900,60,86400);
  if(!(await rateAllow(env,'admin-login',ip,limit,windowSeconds)))throw new ApiError('ADMIN_LOGIN_RATE_LIMITED','Too many login attempts. Try again later.',429);
  const d=await readJson(request,env); const email=String(d.email||'').trim().toLowerCase(), password=String(d.password||'');
  if(!isEmail(email)||!password)throw new ApiError('ADMIN_LOGIN_INVALID','Email or password is incorrect.',401);
  const admin=await env.DB.prepare('SELECT id,name,email,password_hash,is_active,last_login_at FROM admin_users WHERE email=? LIMIT 1').bind(email).first();
  if(!admin||!bool(admin.is_active)||!(await verifyPassword(password,admin.password_hash,env)))throw new ApiError('ADMIN_LOGIN_INVALID','Email or password is incorrect.',401);
  await env.DB.prepare('UPDATE admin_users SET last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(admin.id).run();
  await audit(env,{adminId:Number(admin.id),action:'admin.login',entityType:'admin_user',entityId:String(admin.id),rid,ip});
  const ttl=intVar(env,'ADMIN_SESSION_TIMEOUT_SECONDS',28800,900,86400*7); const s=await sessionToken(env,Number(admin.id),ttl); const csrf=await csrfFor(env,s.payload.nonce);
  return dataResponse({user:{id:Number(admin.id),name:admin.name,email:admin.email},csrf_token:csrf},200,{'Set-Cookie':adminCookie(s.token,ttl)});
}

export async function adminMe(request,env){const auth=await requireAdmin(request,env);return {user:auth.user,csrf_token:auth.csrf};}
export async function adminLogout(request,env,rid){assertSameOrigin(request);const auth=await requireAdmin(request,env);await requireCsrf(request,env,auth);await audit(env,{adminId:auth.user.id,action:'admin.logout',entityType:'admin_user',entityId:String(auth.user.id),rid,ip:clientIp(request)});return dataResponse({logged_out:true},200,{'Set-Cookie':clearAdminCookie()});}
