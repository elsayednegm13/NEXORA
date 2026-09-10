'use strict';

import { esc } from './dom.js';

const EXECUTION_ICONS={
  done:['circle-check','✓'],
  completed:['circle-check','✓'],
  in_progress:['arrows-rotate','↻'],
  blocked:['circle-pause','!'],
  overdue:['triangle-exclamation','!'],
  cancelled:['ban','×'],
  todo:['circle-dot','•'],
  pending:['clock','•'],
  archived:['box-archive','□']
};

export function faIcon(name,{fallback='',className='',fixed=false}={}){
  const classes=['fa-solid',`fa-${String(name||'circle')}`,'nexora-fa'];
  if(fixed)classes.push('fa-fw');
  if(className)classes.push(...String(className).split(/\s+/).filter(Boolean));
  return `<i class="${classes.map(esc).join(' ')}" aria-hidden="true">${esc(fallback)}</i>`;
}

export function executionStateIcon(state,className=''){
  const [name,fallback]=EXECUTION_ICONS[state]||['circle','•'];
  return faIcon(name,{fallback,className});
}
