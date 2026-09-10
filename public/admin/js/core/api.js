'use strict';

import { state } from './state.js';
import { t } from './i18n.js';

let unauthenticatedHandler=()=>{};
export function setUnauthenticatedHandler(handler){unauthenticatedHandler=typeof handler==='function'?handler:()=>{}}

export async function api(path,opt={}){
  const headers={'Accept':'application/json',...(opt.body?{'Content-Type':'application/json'}:{}),...(opt.csrf?{'X-CSRF-Token':state.csrf}:{})};
  const res=await fetch('../api/v1'+path,{method:opt.method||'GET',headers,credentials:'same-origin',body:opt.body?JSON.stringify(opt.body):undefined});
  let json={};try{json=await res.json()}catch{}
  if(res.status===401&&!path.includes('/auth/login')){unauthenticatedHandler(t('sessionExpired'));throw new Error('UNAUTHENTICATED')}
  if(!res.ok){const e=new Error(json?.error?.message||t('requestFailed'));e.code=json?.error?.code||'REQUEST_FAILED';e.status=res.status;throw e}
  return json.data;
}
