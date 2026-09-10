from pathlib import Path
import hashlib, sqlite3, re
ROOT=Path(__file__).resolve().parents[2]; MIG=ROOT/'migrations'
EXPECTED={
'0001_schema.sql':'f15d52ce1d8cc85927b80e6a4e66702de03c6a5f0cdc4808fd45ed3303f2071c','0002_seed.sql':'67aadca2061e63129479739e1546865ce337cc52a88bb0cfbe771eb6d5d804cc','0003_inquiry_locale.sql':'67058b0525f0ed1029a9dd89f3dd1df23ae2e99b9c173c6f4c2ebd70c835f113','0004_clients_core.sql':'4e202a5b9bf9d558f4ed4b0b1593991885fde15b31af976ae14b92ea1be1b533','0005_clients_hardening.sql':'24f1cf87f56fc031848c275f3288ebc62784d019e9fa4d4d992e7987d7c43f8f','0006_clients_code_alignment.sql':'497ee9e3572035abf77586e17786978716f0660cf9aacd0fc64b7404fb03a71e','0007_client_projects.sql':'83128b483a62fe5d629aa24a996afcc7b6250996ddd2a1c42174c70a3d951bf6','0008_client_project_execution.sql':'06e055abaf180260dbc19a6a528fc7b9168f4511922942ed73775202d381b1f6','0009_client_project_portal_support.sql':'14a27191695a7082466203c167c223decba789c78ce862f62ed0021eaaa39d11'}
def ok(c,m):
    if not c: raise AssertionError(m)
files=sorted(x.name for x in MIG.glob('*.sql')); ok(files==list(EXPECTED)+['0010_client_project_collaboration.sql'],'migration inventory')
for name,digest in EXPECTED.items(): ok(hashlib.sha256((MIG/name).read_bytes()).hexdigest()==digest,f'protected migration changed: {name}')
sql=(MIG/'0010_client_project_collaboration.sql').read_text(encoding='utf-8'); stripped=re.sub(r'--.*?$','',sql,flags=re.M)
ok(not re.search(r'^\s*(DROP|TRUNCATE|DELETE|UPDATE|INSERT|REPLACE)\b',stripped,re.I|re.M),'0010 destructive/data mutation SQL')
con=sqlite3.connect(':memory:');con.execute('PRAGMA foreign_keys=ON')
for f in files: con.executescript((MIG/f).read_text(encoding='utf-8'))
cols=lambda t:{r[1]:r for r in con.execute(f'PRAGMA table_info({t})')}
for t in ['client_project_folders','client_project_files','client_project_file_versions','client_project_ticket_attachments']:
    ok(t in {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")},f'missing {t}');ok(con.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]==0,f'{t} not empty')
ok('client_request_id' in cols('client_project_tickets'),'ticket idempotency column missing');ok('client_request_id' in cols('client_project_ticket_messages'),'message idempotency column missing')
ok({'public_id','client_project_id','folder_id','display_name','file_kind','visibility','source_ticket_id','source_message_id'}<=set(cols('client_project_files')),'file metadata columns')
ok({'file_id','version_no','object_key','content_type','size_bytes','sha256_hex','client_request_id'}<=set(cols('client_project_file_versions')),'version columns')
idx={r[1] for r in con.execute("PRAGMA index_list('client_project_tickets')")};ok('idx_client_project_tickets_request_id' in idx,'ticket idempotency unique index')
idx={r[1] for r in con.execute("PRAGMA index_list('client_project_ticket_messages')")};ok('idx_client_project_ticket_messages_request_id' in idx,'message idempotency unique index')
idx={r[1] for r in con.execute("PRAGMA index_list('client_project_file_versions')")};ok('idx_client_project_file_versions_request' in idx,'file idempotency unique index')
ok(con.execute('PRAGMA foreign_key_check').fetchall()==[],'foreign key check')
ok(con.execute('SELECT COUNT(*) FROM projects').fetchone()[0]==12,'Portfolio seed changed');ok(con.execute('SELECT COUNT(*) FROM services').fetchone()[0]==5,'Services seed changed')
print('NX_DATA_5_SCHEMA_PROOF_PASS');print('Migration inventory: 0001..0010 PASS');print('0001..0009 byte-identical PASS');print('0010 additive-only PASS');print('Idempotency/file metadata/FK contracts PASS')
