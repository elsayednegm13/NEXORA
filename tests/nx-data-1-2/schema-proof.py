from __future__ import annotations
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "migrations"
EXPECTED = [
    "0001_schema.sql",
    "0002_seed.sql",
    "0003_inquiry_locale.sql",
    "0004_clients_core.sql",
    "0005_clients_hardening.sql",
    "0006_clients_code_alignment.sql",
]

def apply(conn: sqlite3.Connection, name: str):
    conn.executescript((MIGRATIONS / name).read_text(encoding="utf-8"))

def main():
    names = [p.name for p in sorted(MIGRATIONS.glob("*.sql"))]
    assert names == EXPECTED, f"Migration inventory mismatch: {names}"

    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys=ON")
    for name in EXPECTED[:4]:
        apply(conn, name)

    conn.execute("INSERT INTO admin_users(name,email,password_hash) VALUES (?,?,?)", ("Alignment Admin", "align@test.invalid", "x"))
    admin_id = conn.execute("SELECT id FROM admin_users WHERE email=?", ("align@test.invalid",)).fetchone()[0]

    # Simulate pre-0005 clients with arbitrary/manual codes. Identity must remain stable.
    legacy = [
        ("cli_align_a", "01", "company", "Client One"),
        ("cli_align_b", "CU-001", "individual", "Client Two"),
        ("cli_align_c", None, "company", "Client Three"),
    ]
    for public_id, code, client_type, display_name in legacy:
        conn.execute(
            """INSERT INTO clients(public_id,client_code,client_type,display_name,default_currency,preferred_language,status,created_by_admin_id)
               VALUES (?,?,?,?,?,?,?,?)""",
            (public_id, code, client_type, display_name, "EGP", "ar", "active", admin_id),
        )
    identity_before = conn.execute("SELECT id,public_id FROM clients ORDER BY id").fetchall()
    assert identity_before == [(1,"cli_align_a"),(2,"cli_align_b"),(3,"cli_align_c")]

    # 0005 is immutable historical state and intentionally demonstrates the superseded id-1 rule.
    apply(conn, "0005_clients_hardening.sql")
    assert conn.execute("SELECT id,client_code FROM clients ORDER BY id").fetchall() == [
        (1,"CU-000"),(2,"CU-001"),(3,"CU-002")
    ]

    # Simulate the rollout gap that actually occurred: old runtime can write a manual code after 0005.
    conn.execute("UPDATE clients SET client_code='CU-777' WHERE id=1")

    # 0006 is the forward-only owner correction: code number equals the real client id.
    apply(conn, "0006_clients_code_alignment.sql")
    corrected = conn.execute("SELECT id,public_id,client_code FROM clients ORDER BY id").fetchall()
    assert corrected == [
        (1,"cli_align_a","CU-001"),
        (2,"cli_align_b","CU-002"),
        (3,"cli_align_c","CU-003"),
    ]
    assert conn.execute("SELECT id,public_id FROM clients ORDER BY id").fetchall() == identity_before

    # Minimum width is 3; it is not a maximum.
    samples = {i: conn.execute("SELECT 'CU-' || printf('%03d', ?)", (i,)).fetchone()[0] for i in (1,9,99,999,1000,1001)}
    assert samples == {1:"CU-001",9:"CU-009",99:"CU-099",999:"CU-999",1000:"CU-1000",1001:"CU-1001"}

    # 0006 is deterministic/repeat-safe in disposable proof.
    apply(conn, "0006_clients_code_alignment.sql")
    assert conn.execute("SELECT id,client_code FROM clients ORDER BY id").fetchall() == [(1,"CU-001"),(2,"CU-002"),(3,"CU-003")]

    # Hard-delete a clean client and prove AUTOINCREMENT does not reuse the hole.
    conn.execute("DELETE FROM clients WHERE id=3")
    conn.execute(
        """INSERT INTO clients(public_id,client_code,client_type,display_name,default_currency,preferred_language,status,created_by_admin_id)
           VALUES (?,?,?,?,?,?,?,?)""",
        ("cli_align_d", None, "individual", "After Delete", "EGP", "ar", "active", admin_id),
    )
    next_id = conn.execute("SELECT id FROM clients WHERE public_id='cli_align_d'").fetchone()[0]
    assert next_id == 4, f"AUTOINCREMENT reused/resequenced id: {next_id}"
    next_code = conn.execute("SELECT 'CU-' || printf('%03d', ?)", (next_id,)).fetchone()[0]
    assert next_code == "CU-004"

    # Existing 0005 token schema remains intact and referential integrity remains clean.
    assert conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='client_profile_tokens'").fetchone()[0] == 1
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []

    # Existing public seed remains unchanged.
    assert conn.execute("SELECT COUNT(*) FROM services").fetchone()[0] == 5
    assert conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0] == 12
    assert conn.execute("SELECT COUNT(*) FROM inquiry_option_items").fetchone()[0] == 16

    forbidden = {"client_projects","project_tasks","project_milestones","service_tickets","quotes","invoices","portal_access_grants"}
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert not (forbidden & tables), f"Future tables introduced early: {sorted(forbidden & tables)}"

    print("NX-DATA-1.2 schema proof: PASS")
    print("Migration chain 0001..0006: PASS")
    print("0005 immutable historical semantics observed: PASS")
    print("0006 CU-id alignment: PASS")
    print("CU-001 start / CU-999 / CU-1000 unbounded formatting: PASS")
    print("Client id/public_id preservation: PASS")
    print("AUTOINCREMENT no-reuse after hard delete: PASS")
    print("Existing token schema + FK integrity: PASS")
    print("Public seed preservation: PASS")
    print("Future module isolation: PASS")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"NX-DATA-1.2 schema proof: FAIL: {exc}", file=sys.stderr)
        raise
