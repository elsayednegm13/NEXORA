from pathlib import Path
import hashlib, sqlite3, re
ROOT=Path(__file__).resolve().parents[2]
MIG=ROOT/'migrations'
EXPECTED={
'0001_schema.sql':'f15d52ce1d8cc85927b80e6a4e66702de03c6a5f0cdc4808fd45ed3303f2071c',
'0002_seed.sql':'67aadca2061e63129479739e1546865ce337cc52a88bb0cfbe771eb6d5d804cc',
'0003_inquiry_locale.sql':'67058b0525f0ed1029a9dd89f3dd1df23ae2e99b9c173c6f4c2ebd70c835f113',
'0004_clients_core.sql':'4e202a5b9bf9d558f4ed4b0b1593991885fde15b31af976ae14b92ea1be1b533',
'0005_clients_hardening.sql':'24f1cf87f56fc031848c275f3288ebc62784d019e9fa4d4d992e7987d7c43f8f',
'0006_clients_code_alignment.sql':'497ee9e3572035abf77586e17786978716f0660cf9aacd0fc64b7404fb03a71e',
'0007_client_projects.sql':'83128b483a62fe5d629aa24a996afcc7b6250996ddd2a1c42174c70a3d951bf6',
'0008_client_project_execution.sql':'06e055abaf180260dbc19a6a528fc7b9168f4511922942ed73775202d381b1f6'}

def ok(c,m):
    if not c: raise AssertionError(m)
files=sorted(x.name for x in MIG.glob('*.sql'));ok(files==[f'{i:04d}_{n}' for i,n in []] if False else files,'')
ok(files==['0001_schema.sql','0002_seed.sql','0003_inquiry_locale.sql','0004_clients_core.sql','0005_clients_hardening.sql','0006_clients_code_alignment.sql','0007_client_projects.sql','0008_client_project_execution.sql','0009_client_project_portal_support.sql'],'migration inventory')
for name,digest in EXPECTED.items():ok(hashlib.sha256((MIG/name).read_bytes()).hexdigest()==digest,f'protected migration changed: {name}')
sql9=(MIG/'0009_client_project_portal_support.sql').read_text(encoding='utf-8')
ok('DROP TABLE' not in sql9.upper() and 'DELETE FROM' not in sql9.upper(),'0009 destructive SQL')
# Evolving workflow states must remain Worker-authoritative; only boolean checks are allowed here.
for table in ['client_project_access_grants','client_project_tickets','client_project_ticket_messages','client_project_ticket_events']:
    block=re.search(rf'CREATE TABLE IF NOT EXISTS {table} \((.*?)\);',sql9,re.S|re.I).group(1)
    for field in ['status','type','priority','visibility','event_type','actor_type','author_type']:
        if field in block.lower(): ok(not re.search(rf'CHECK\s*\([^)]*\b{field}\b',block,re.I),f'workflow CHECK introduced for {table}.{field}')
con=sqlite3.connect(':memory:');con.execute('PRAGMA foreign_keys=ON')
for f in files:con.executescript((MIG/f).read_text(encoding='utf-8'))
expected_tables={'client_project_access_grants','client_portal_sessions','client_project_tickets','client_project_ticket_messages','client_project_ticket_events'}
tables={r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")};ok(expected_tables<=tables,'new table inventory')
for table in expected_tables:ok(con.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]==0,f'{table} not empty')
cols=lambda table:{r[1] for r in con.execute(f'PRAGMA table_info({table})')}
ok('client_visible' in cols('client_project_milestones') and 'client_visible' in cols('client_project_tasks'),'client_visible columns missing')
ok({'token_hash','client_project_id','client_id','client_contact_id','expires_at','revoked_at'}<=cols('client_project_access_grants'),'access grant columns')
ok({'session_hash','csrf_hash','access_grant_id','expires_at','revoked_at'}<=cols('client_portal_sessions'),'session columns')
ok({'ticket_code','client_project_id','client_id','type','status','priority','assigned_admin_id'}<=cols('client_project_tickets'),'ticket columns')
# Hash-only storage contract: no raw-token field exists.
for table in ['client_project_access_grants','client_portal_sessions']:
    names=cols(table);ok('token' not in names and 'session_token' not in names and 'raw_token' not in names,f'raw token storage column in {table}')
# Portfolio remains intact and seeded data preserved.
ok(con.execute('SELECT COUNT(*) FROM projects').fetchone()[0]==12,'Portfolio projects changed')
ok(con.execute('SELECT COUNT(*) FROM services').fetchone()[0]==5,'services seed changed')
ok(con.execute('PRAGMA foreign_key_check').fetchall()==[],'foreign key check')
# Visibility defaults deny-by-default for existing/internal execution records.
ok(con.execute("SELECT dflt_value FROM pragma_table_info('client_project_tasks') WHERE name='client_visible'").fetchone()[0]=='0','task visibility default')
ok(con.execute("SELECT dflt_value FROM pragma_table_info('client_project_milestones') WHERE name='client_visible'").fetchone()[0]=='0','milestone visibility default')
print('NX_DATA_4_SCHEMA_PROOF_PASS')
print('Migration inventory: 0001..0009 PASS')
print('0001..0008 byte-identical PASS')
print('0009 additive-only / workflow catalogs service-authoritative PASS')
print('Portal hash-only + deny-by-default visibility PASS')
print('Foreign key check PASS')
