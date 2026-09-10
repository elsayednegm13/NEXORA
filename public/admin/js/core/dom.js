'use strict';

import { state } from './state.js';

export const $=(s,r=document)=>r.querySelector(s);
export const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
export const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
export const safeUrl=v=>{try{const u=new URL(String(v||''),location.origin);return (u.protocol==='http:'||u.protocol==='https:')?u.href:'#'}catch{return '#'}};
export const fmtDate=v=>{if(!v)return '—';try{return new Intl.DateTimeFormat(state.lang==='ar'?'ar-EG':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(String(v).replace(' ','T')))}catch{return String(v)}};
export const initials=name=>String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'N';
export function debounce(fn,ms=350){let x;return(...a)=>{clearTimeout(x);x=setTimeout(()=>fn(...a),ms)}}
