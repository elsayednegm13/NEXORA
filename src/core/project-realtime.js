'use strict';

function namespaceStub(env,projectId){
  const ns=env.PROJECT_REALTIME;
  if(!ns)return null;
  const name=`project:${Number(projectId)}`;
  if(typeof ns.getByName==='function')return ns.getByName(name);
  if(typeof ns.idFromName==='function'&&typeof ns.get==='function')return ns.get(ns.idFromName(name));
  return null;
}

export async function connectProjectRealtime(request,env,projectId,{role,grantId=null}={}){
  const stub=namespaceStub(env,projectId);
  if(!stub)return new Response('Realtime unavailable',{status:503});
  const headers=new Headers(request.headers);
  headers.set('X-Nexora-Realtime-Role',String(role||'client'));
  headers.set('X-Nexora-Grant-Id',grantId===null?'':String(grantId));
  headers.set('X-Nexora-Project-Id',String(projectId));
  return stub.fetch(new Request('https://nexora.internal/connect',{method:'GET',headers}));
}

export async function publishProjectEvent(env,projectId,event){
  const stub=namespaceStub(env,projectId);
  if(!stub)return false;
  const payload={
    id:`evt_${crypto.randomUUID().replace(/-/g,'').slice(0,20)}`,
    visibility:event?.visibility==='internal'?'internal':'client',
    type:String(event?.type||'project.updated'),
    ticket_public_id:event?.ticket_public_id||null,
    file_public_id:event?.file_public_id||null,
    at:new Date().toISOString()
  };
  try{
    const res=await stub.fetch('https://nexora.internal/broadcast',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!res.ok)console.error('NEXORA_REALTIME_BROADCAST_FAILED',projectId,res.status);
    return res.ok;
  }catch(err){
    console.error('NEXORA_REALTIME_BROADCAST_ERROR',projectId,err?.message||err);
    return false;
  }
}
