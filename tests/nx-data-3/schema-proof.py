from __future__ import annotations
import sqlite3
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
MIGRATIONS=ROOT/'migrations'
BASE=[f'{i:04d}_{name}.sql' for i,name in [
    (1,'schema'),(2,'seed'),(3,'inquiry_locale'),(4,'clients_core'),(5,'clients_hardening'),(6,'clients_code_alignment'),(7,'client_projects')
]]
NEW='0008_client_project_execution.sql'
NEW_TABLES={'client_project_milestones','client_project_tasks','client_project_task_assignees'}
FORBIDDEN={'tickets','quotes','invoices','payments','client_portal_sessions','private_files','time_entries'}

def cols(c,t): return [r[1] for r in c.execute(f'PRAGMA table_info({t})')]
def idx(c,t): return {r[1] for r in c.execute(f'PRAGMA index_list({t})')}
def fks(c,t): return c.execute(f'PRAGMA foreign_key_list({t})').fetchall()
def integrity_error(fn,msg):
    try: fn()
    except sqlite3.IntegrityError: return
    raise AssertionError(msg)

def main():
    c=sqlite3.connect(':memory:');c.execute('PRAGMA foreign_keys=ON')
    for f in BASE:c.executescript((MIGRATIONS/f).read_text(encoding='utf-8'))
    before={t:c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in ['services','projects','project_inquiries','clients']}
    sql=(MIGRATIONS/NEW).read_text(encoding='utf-8');c.executescript(sql);c.executescript(sql)
    after={t:c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in before}
    assert before==after,'protected data changed'
    tables={r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert NEW_TABLES<=tables
    assert not (FORBIDDEN & tables)
    for t in NEW_TABLES: assert c.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]==0
    assert cols(c,'client_project_milestones')==['id','public_id','client_project_id','title','description','status','sort_order','target_date','completed_at','created_by_admin_id','updated_by_admin_id','created_at','updated_at','archived_at']
    assert cols(c,'client_project_tasks')==['id','public_id','client_project_id','milestone_id','title','description','status','priority','sort_order','start_date','due_date','completed_at','created_by_admin_id','updated_by_admin_id','created_at','updated_at','archived_at']
    assert cols(c,'client_project_task_assignees')==['client_project_task_id','client_project_id','admin_user_id','assigned_by_admin_id','assigned_at']
    assert {'idx_client_project_milestones_project_order','idx_client_project_milestones_target'}<=idx(c,'client_project_milestones')
    assert {'idx_client_project_tasks_project_status_due','idx_client_project_tasks_milestone','idx_client_project_tasks_due'}<=idx(c,'client_project_tasks')
    assert {'idx_client_project_task_assignees_admin'}<=idx(c,'client_project_task_assignees')

    # Disposable relational proof.
    c.execute("INSERT INTO admin_users(name,email,password_hash,is_active) VALUES('Admin','a@test','x',1)");admin=1
    c.execute("INSERT INTO admin_users(name,email,password_hash,is_active) VALUES('Other','b@test','x',1)");other=2
    c.execute("INSERT INTO clients(public_id,client_code,client_type,display_name,default_currency,preferred_language,status,created_by_admin_id) VALUES('cli_a','CU-001','company','A','EGP','en','active',1)");client=1
    for n in (1,2):
        c.execute("INSERT INTO client_projects(public_id,project_code,client_id,name,status,priority,progress_mode,manual_progress_percent,portal_visible,created_by_admin_id) VALUES(?,?,?,?,?,?,?,?,?,?)",(f'cp{n}',f'PRJ-00{n}',client,f'P{n}','planning','normal','manual',0,0,admin))
    c.execute("INSERT INTO client_project_members(client_project_id,admin_user_id,role_key,is_lead) VALUES(1,1,'lead',1)")
    c.execute("INSERT INTO client_project_milestones(public_id,client_project_id,title,status,sort_order,created_by_admin_id) VALUES('m1',1,'M1','future_milestone_state',0,1)")
    milestone=c.execute("SELECT id FROM client_project_milestones WHERE public_id='m1'").fetchone()[0]
    # Workflow states are not frozen by DB CHECK constraints.
    c.execute("INSERT INTO client_project_tasks(public_id,client_project_id,milestone_id,title,status,priority,sort_order,created_by_admin_id) VALUES('t1',1,?,'T1','future_task_state','future_priority',0,1)",(milestone,))
    task=c.execute("SELECT id FROM client_project_tasks WHERE public_id='t1'").fetchone()[0]
    c.execute("INSERT INTO client_project_task_assignees(client_project_task_id,client_project_id,admin_user_id,assigned_by_admin_id) VALUES(?,?,?,?)",(task,1,admin,admin))
    # Cross-project milestone relation is rejected by composite FK.
    integrity_error(lambda:c.execute("INSERT INTO client_project_tasks(public_id,client_project_id,milestone_id,title,status,priority,sort_order,created_by_admin_id) VALUES('cross',2,?,'Cross','todo','normal',0,1)",(milestone,)),'cross-project milestone accepted')
    # Assignee must be a project member at DB level as well.
    integrity_error(lambda:c.execute("INSERT INTO client_project_task_assignees(client_project_task_id,client_project_id,admin_user_id,assigned_by_admin_id) VALUES(?,?,?,?)",(task,1,other,admin)),'non-member task assignee accepted')
    integrity_error(lambda:c.execute("INSERT INTO client_project_milestones(public_id,client_project_id,title,status,sort_order,created_by_admin_id) VALUES('bad_sort',1,'Bad','pending',-1,1)"),'negative milestone sort accepted')
    integrity_error(lambda:c.execute("INSERT INTO client_project_tasks(public_id,client_project_id,title,status,priority,sort_order,created_by_admin_id) VALUES('bad_task_sort',1,'Bad','todo','normal',-1,1)"),'negative task sort accepted')
    integrity_error(lambda:c.execute("DELETE FROM client_projects WHERE id=1"),'project with execution history deleted')
    integrity_error(lambda:c.execute("DELETE FROM client_project_members WHERE client_project_id=1 AND admin_user_id=1"),'assigned project member deleted')
    assert c.execute('PRAGMA foreign_key_check').fetchall()==[]
    print('NX_DATA_3_SCHEMA_PROOF_PASS')

if __name__=='__main__':main()
