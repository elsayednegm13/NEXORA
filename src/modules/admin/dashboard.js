'use strict';

export async function adminDashboard(env){
  const statements=[
    env.DB.prepare('SELECT COUNT(*) value FROM projects'),env.DB.prepare('SELECT COUNT(*) value FROM projects WHERE is_active=1'),
    env.DB.prepare('SELECT COUNT(*) value FROM services'),env.DB.prepare('SELECT COUNT(*) value FROM services WHERE is_active=1'),
    env.DB.prepare('SELECT COUNT(*) value FROM project_inquiries'),env.DB.prepare("SELECT COUNT(*) value FROM project_inquiries WHERE status='new'"),
    env.DB.prepare('SELECT id,public_id,name,email,status,created_at FROM project_inquiries ORDER BY created_at DESC,id DESC LIMIT 6')
  ];
  const r=await env.DB.batch(statements); const val=i=>Number(r[i]?.results?.[0]?.value||0);
  return {counts:{projects:val(0),active_projects:val(1),services:val(2),active_services:val(3),inquiries:val(4),new_inquiries:val(5)},recent_inquiries:(r[6]?.results||[]).map(x=>({...x,id:Number(x.id)}))};
}
