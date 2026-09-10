from __future__ import annotations
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "migrations"
FILES = [MIGRATIONS / f"000{i}_" for i in range(1, 5)]


def migration_files():
    items = sorted(MIGRATIONS.glob("*.sql"))
    names = [p.name for p in items]
    expected = [
        "0001_schema.sql",
        "0002_seed.sql",
        "0003_inquiry_locale.sql",
        "0004_clients_core.sql",
    ]
    assert names == expected, f"Migration inventory mismatch: {names}"
    return items


def col_names(conn: sqlite3.Connection, table: str):
    return [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]


def fk_rows(conn: sqlite3.Connection, table: str):
    return conn.execute(f"PRAGMA foreign_key_list({table})").fetchall()


def main():
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")
    for path in migration_files():
        conn.executescript(path.read_text(encoding="utf-8"))

    # Re-applying 0004 must remain safe/idempotent in disposable validation.
    conn.executescript((MIGRATIONS / "0004_clients_core.sql").read_text(encoding="utf-8"))

    fk_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
    assert fk_errors == [], f"Foreign key check failed: {fk_errors}"

    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    for table in {"clients", "client_contacts", "inquiry_conversions"}:
        assert table in tables, f"Missing {table}"

    expected_client_cols = {
        "id","public_id","client_code","client_type","display_name","legal_name",
        "default_currency","preferred_language","status","billing_name","billing_email",
        "billing_phone","billing_address_line1","billing_address_line2","billing_city",
        "billing_region","billing_postal_code","billing_country_code","tax_identifier",
        "created_by_admin_id","created_at","updated_at","archived_at"
    }
    assert set(col_names(conn, "clients")) == expected_client_cols

    # Ensure Phase 6.2 seed remains untouched by 0004.
    counts = {}
    for table in ("services", "projects", "inquiry_option_items", "admin_users", "clients", "client_contacts", "inquiry_conversions"):
        counts[table] = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    assert counts["services"] == 5
    assert counts["projects"] == 12
    assert counts["inquiry_option_items"] == 16
    assert counts["admin_users"] == 0
    assert counts["clients"] == 0
    assert counts["client_contacts"] == 0
    assert counts["inquiry_conversions"] == 0

    # Disposable relational/idempotency proof in a transaction.
    conn.execute("BEGIN")
    conn.execute("INSERT INTO admin_users(name,email,password_hash) VALUES (?,?,?)", ("Test Admin","nx-data1@test.invalid","x"))
    admin_id = conn.execute("SELECT id FROM admin_users WHERE email=?", ("nx-data1@test.invalid",)).fetchone()[0]
    conn.execute("""
        INSERT INTO project_inquiries(
          public_id,client_request_id,name,email,project_stage_key,timeline_key,budget_mode_key,
          description,preferred_contact,privacy_accepted_at,status,submission_language
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    """, ("inq_test_data1","req_test_data1","Test Lead","lead@test.invalid","idea","flexible","not_sure","Test","email","2026-09-07T00:00:00Z","qualified","en"))
    inquiry_id = conn.execute("SELECT id FROM project_inquiries WHERE public_id='inq_test_data1'").fetchone()[0]
    conn.execute("""
        INSERT INTO clients(public_id,client_code,client_type,display_name,default_currency,preferred_language,status,created_by_admin_id)
        VALUES (?,?,?,?,?,?,?,?)
    """, ("cli_test_data1","NXC-TEST","company","Test Client","USD","en","active",admin_id))
    client_id = conn.execute("SELECT id FROM clients WHERE public_id='cli_test_data1'").fetchone()[0]
    conn.execute("""
        INSERT INTO client_contacts(public_id,client_id,name,email,preferred_language,is_primary,portal_enabled,status)
        VALUES (?,?,?,?,?,?,?,?)
    """, ("ctc_test_data1",client_id,"Primary Contact","contact@test.invalid","en",1,0,"active"))
    conn.execute("""
        INSERT INTO inquiry_conversions(project_inquiry_id,client_id,converted_by_admin_id,context_json)
        VALUES (?,?,?,?)
    """, (inquiry_id,client_id,admin_id,json.dumps({"proof": True})))

    # One inquiry may be converted only once.
    try:
        conn.execute("INSERT INTO inquiry_conversions(project_inquiry_id,client_id,converted_by_admin_id) VALUES (?,?,?)", (inquiry_id,client_id,admin_id))
        raise AssertionError("Duplicate inquiry conversion was accepted")
    except sqlite3.IntegrityError:
        pass

    # Client cannot be deleted while contact/conversion history references it.
    try:
        conn.execute("DELETE FROM clients WHERE id=?", (client_id,))
        raise AssertionError("Referenced client delete was accepted")
    except sqlite3.IntegrityError:
        pass

    conn.rollback()
    assert conn.execute("SELECT COUNT(*) FROM clients").fetchone()[0] == 0

    print("NX-DATA-1 schema proof: PASS")
    print("Migration inventory: 0001..0004 PASS")
    print("0004 repeat-apply safety: PASS")
    print("Foreign keys: PASS")
    print("Phase 6.2 seed preservation: PASS")
    print("Clients Core starts empty: PASS")
    print("Inquiry conversion idempotency constraint: PASS")
    print("Referenced client delete restriction: PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"NX-DATA-1 schema proof: FAIL: {exc}", file=sys.stderr)
        raise
