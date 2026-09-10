'use strict';

export function match(path, pattern) {
  const keys=[];
  const escapeRe = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const source = pattern.split('/').map(segment => {
    if (segment.startsWith(':')) { keys.push(segment.slice(1)); return '([^/]+)'; }
    return escapeRe(segment);
  }).join('/');
  const m=path.match(new RegExp(`^${source}$`));
  if(!m)return null;
  const params={};
  keys.forEach((k,i)=>params[k]=decodeURIComponent(m[i+1]));
  return params;
}
