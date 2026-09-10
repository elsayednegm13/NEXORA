'use strict';

import { state } from './state.js';
import { $, esc } from './dom.js';
import { faIcon } from './icons.js';

export function toast(msg,type='ok'){
  const el=$('#toast');if(!el)return;
  const kind=['ok','error','warning','info'].includes(type)?type:'ok';
  const icon={ok:['circle-check','✓'],error:['circle-xmark','!'],warning:['triangle-exclamation','!'],info:['circle-info','i']}[kind];
  el.innerHTML=`<span class="toast-icon" aria-hidden="true">${faIcon(icon[0],{fallback:icon[1]})}</span><span class="toast-message">${esc(msg)}</span>`;
  el.className='toast '+kind;el.hidden=false;el.setAttribute('role',kind==='error'?'alert':'status');
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>{el.hidden=true},kind==='error'?5000:3400);
}
export function fields(arr){return `<div class="fields-2">${arr.map(([l,n,v,type='text'])=>`<label class="field"><span>${esc(l)}</span><input name="${esc(n)}" type="${type}" value="${esc(v)}"></label>`).join('')}</div>`}
export function textareas(arr){return arr.map(([l,n,v])=>`<label class="field"><span>${esc(l)}</span><textarea name="${esc(n)}">${esc(v)}</textarea></label>`).join('')}
export function switches(arr){return arr.map(([l,n,v])=>`<div class="switch-row"><span>${esc(l)}</span><label class="switch"><input name="${esc(n)}" type="checkbox" ${v?'checked':''}><i></i></label></div>`).join('')}
export function formSection(title,body){return `<section class="form-section"><h3>${esc(title)}</h3>${body}</section>`}
export function formObject(f){return Object.fromEntries(new FormData(f))}
export function openDrawer(eyebrow,title,html){$('#drawerEyebrow').textContent=eyebrow;$('#drawerTitle').textContent=title;$('#drawerBody').innerHTML=html;$('#drawerBackdrop').hidden=false;requestAnimationFrame(()=>$('#detailDrawer').classList.add('is-open'));$('#detailDrawer').setAttribute('aria-hidden','false')}
export function closeDrawer(){state.activeInquiry=null;state.activeClient=null;state.activeClientProject=null;state.drawerMode=null;$('#detailDrawer').classList.remove('is-open');$('#detailDrawer').setAttribute('aria-hidden','true');setTimeout(()=>$('#drawerBackdrop').hidden=true,280)}

export function openProjectWorkspace(eyebrow,title,html){
  const layer=$('#projectWorkspaceLayer'),body=$('#projectWorkspaceBody');
  if(!layer||!body)return;
  const activeProject=state.activeClientProject;
  closeDrawer();
  state.activeClientProject=activeProject;state.drawerMode=null;
  $('#projectWorkspaceEyebrow').textContent=eyebrow||'CLIENT PROJECT';
  $('#projectWorkspaceTitle').textContent=title||'';
  body.innerHTML=html;
  layer.hidden=false;layer.setAttribute('aria-hidden','false');
  state.projectWorkspaceOpen=true;
  document.body.classList.add('project-workspace-open');
  requestAnimationFrame(()=>layer.classList.add('is-open'));
}
export function closeProjectWorkspace(){
  const layer=$('#projectWorkspaceLayer');
  if(!layer||layer.hidden)return;
  layer.classList.remove('is-open');layer.setAttribute('aria-hidden','true');
  state.projectWorkspaceOpen=false;state.activeClientProject=null;
  document.body.classList.remove('project-workspace-open');
  setTimeout(()=>{if(!state.projectWorkspaceOpen){layer.hidden=true;const body=$('#projectWorkspaceBody');if(body)body.innerHTML=''}},220);
}

let activeConfirm=null;
export function confirmDialog({title,message,confirmText='Confirm',cancelText='Cancel',danger=false,inputLabel='',inputExpected=null}={}){
  if(activeConfirm)activeConfirm(false);
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{
      if(settled)return;settled=true;
      document.removeEventListener('keydown',onKey);
      layer.remove();activeConfirm=null;resolve(value);
    };
    activeConfirm=finish;
    const needsInput=inputExpected!==null&&inputExpected!==undefined;
    const expected=String(inputExpected??'').trim().toUpperCase();
    const layer=document.createElement('div');layer.className='nexora-confirm-layer';
    layer.innerHTML=`<div class="nexora-confirm" role="dialog" aria-modal="true" aria-labelledby="nexoraConfirmTitle"><div class="nexora-confirm-mark ${danger?'is-danger':''}">${danger?faIcon('triangle-exclamation',{fallback:'!'}):faIcon('circle-question',{fallback:'?'})}</div><div class="nexora-confirm-copy"><h3 id="nexoraConfirmTitle">${esc(title||'')}</h3><p>${esc(message||'')}</p></div>${needsInput?`<label class="field nexora-confirm-input"><span>${esc(inputLabel||'')}</span><input type="text" autocomplete="off" spellcheck="false" data-confirm-input></label>`:''}<div class="nexora-confirm-actions"><button type="button" class="ghost-btn" data-confirm-cancel>${esc(cancelText)}</button><button type="button" class="${danger?'danger-btn':'primary-btn'}" data-confirm-ok ${needsInput?'disabled':''}>${esc(confirmText)}</button></div></div>`;
    document.body.append(layer);
    const ok=layer.querySelector('[data-confirm-ok]'),cancel=layer.querySelector('[data-confirm-cancel]'),input=layer.querySelector('[data-confirm-input]');
    if(input){input.addEventListener('input',()=>{ok.disabled=String(input.value||'').trim().toUpperCase()!==expected});input.focus()}else ok.focus();
    ok.addEventListener('click',()=>finish(true));cancel.addEventListener('click',()=>finish(false));
    layer.addEventListener('mousedown',e=>{if(e.target===layer)finish(false)});
    function onKey(e){if(e.key==='Escape')finish(false)}document.addEventListener('keydown',onKey);
  });
}
