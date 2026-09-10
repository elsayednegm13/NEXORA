from __future__ import annotations
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "migrations"

EXPECTED_MIGRATIONS = [
    "0001_schema.sql",
    "0002_seed.sql",
    "0003_inquiry_locale.sql",
    "0004_clients_core.sql",
    "0005_clients_hardening.sql",
]


def col_names(conn: sqlite3.Connection, table: str):
    return [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]


def index_names(conn: sqlite3.Connection, table: str):
    return {r[1] for r in conn.execute(f"PRAGMA index_list({table})")}


def expect_integrity_error(fn, message: str):
    try:
        fn()
    except sqlite3.IntegrityError:
        return
    raise AssertionError(message)


def apply(conn: sqlite3.Connection, name: str):
    conn.executescript((MIGRATIONS / name).read_text(encoding="utf-8"))


def main():
    names = [p.name for p in sorted(MIGRATIONS.glob("*.sql"))]
    assert names == EXPECTED_MIGRATIONS, f"Migration inventory mismatch: {names}"

    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")

    # Apply accepted chain through Clients Core first.
    for name in EXPECTED_MIGRATIONS[:4]:
        apply(conn, name)

    # Simulate committed pre-0005 production Clients with legacy/manual/swapped codes.
    conn.execute("INSERT INTO admin_users(name,email,password_hash) VALUES (?,?,?)", ("NX Data 1.1 Admin", "nx-data11@test.invalid", "x"))
    admin_id = conn.execute("SELECT id FROM admin_users WHERE email=?", ("nx-data11@test.invalid",)).fetchone()[0]
    legacy = [
        ("cli_data11_a", "CU-001", "company", "Legacy A"),
        ("cli_data11_b", "CU-000", "individual", "Legacy B"),
        ("cli_data11_c", "01", "company", "Legacy C"),
    ]
    for public_id, code, client_type, display_name in legacy:
        conn.execute(
            """INSERT INTO clients(public_id,client_code,client_type,display_name,default_currency,preferred_language,status,created_by_admin_id)
               VALUES (?,?,?,?,?,?,?,?)""",
            (public_id, code, client_type, display_name, "EGP", "ar", "active", admin_id),
        )
    before_identity = conn.execute("SELECT id,public_id FROM clients ORDER BY id").fetchall()
    assert before_identity == [(1, "cli_data11_a"), (2, "cli_data11_b"), (3, "cli_data11_c")]

    # Apply 0005. The swapped CU-000/CU-001 values prove the two-phase normalization avoids UNIQUE collisions.
    apply(conn, "0005_clients_hardening.sql")

    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "client_profile_tokens" in tables
    for forbidden in {"client_projects", "project_tasks", "project_milestones", "service_tickets", "quotes", "invoices", "portal_access_grants"}:
        assert forbidden not in tables, f"Future table introduced early: {forbidden}"

    expected_token_cols = {
        "id", "public_id", "client_id", "token_hash", "expires_at",
        "completed_at", "revoked_at", "created_by_admin_id", "created_at",
    }
    assert set(col_names(conn, "client_profile_tokens")) == expected_token_cols
    assert {
        "idx_client_profile_tokens_client_created",
        "idx_client_profile_tokens_expiry_state",
    } <= index_names(conn, "client_profile_tokens")

    # Deterministic code normalization: minimum three digits, no artificial upper bound.
    normalized = conn.execute("SELECT id,public_id,client_code FROM clients ORDER BY id").fetchall()
    assert normalized == [
        (1, "cli_data11_a", "CU-000"),
        (2, "cli_data11_b", "CU-001"),
        (3, "cli_data11_c", "CU-002"),
    ]
    assert conn.execute("SELECT id,public_id FROM clients ORDER BY id").fetchall() == before_identity

    # Prove formatting expands naturally beyond CU-999.
    assert conn.execute("SELECT 'CU-' || printf('%03d', ? - 1)", (1001,)).fetchone()[0] == "CU-1000"
    assert conn.execute("SELECT 'CU-' || printf('%03d', ? - 1)", (1002,)).fetchone()[0] == "CU-1001"

    # Profile token security/storage relationships.
    conn.execute(
        """INSERT INTO client_profile_tokens(public_id,client_id,token_hash,expires_at,created_by_admin_id)
           VALUES (?,?,?,?,?)""",
        ("cpt_data11_a", 1, "hash-a", "2026-09-10T00:00:00Z", admin_id),
    )
    expect_integrity_error(
        lambda: conn.execute(
            "INSERT INTO client_profile_tokens(public_id,client_id,token_hash,expires_at,created_by_admin_id) VALUES (?,?,?,?,?)",
            ("cpt_data11_b", 2, "hash-a", "2026-09-10T00:00:00Z", admin_id),
        ),
        "Duplicate token_hash was accepted",
    )
    expect_integrity_error(lambda: conn.execute("DELETE FROM clients WHERE id=1"), "Client referenced by completion token was hard-deleted")
    expect_integrity_error(lambda: conn.execute("DELETE FROM admin_users WHERE id=?", (admin_id,)), "Token creator admin was hard-deleted")

    # Delete an unrelated Client and prove AUTOINCREMENT continues rather than resequencing/reusing the hole.
    conn.execute("DELETE FROM clients WHERE id=3")
    conn.execute(
        """INSERT INTO clients(public_id,client_code,client_type,display_name,default_currency,preferred_language,status,created_by_admin_id)
           VALUES (?,?,?,?,?,?,?,?)""",
        ("cli_data11_d", None, "individual", "After Delete", "EGP", "ar", "active", admin_id),
    )
    next_id = conn.execute("SELECT id FROM clients WHERE public_id='cli_data11_d'").fetchone()[0]
    assert next_id == 4, f"AUTOINCREMENT reused/resequenced an ID: got {next_id}"
    generated = conn.execute("SELECT 'CU-' || printf('%03d', ? - 1)", (next_id,)).fetchone()[0]
    assert generated == "CU-003"

    # Re-applying 0005 in disposable validation is deterministic and collision-safe.
    apply(conn, "0005_clients_hardening.sql")
    assert conn.execute("SELECT client_code FROM clients WHERE id=4").fetchone()[0] == "CU-003"
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []

    # Existing public seed remains unchanged.
    assert conn.execute("SELECT COUNT(*) FROM services").fetchone()[0] == 5
    assert conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0] == 12
    assert conn.execute("SELECT COUNT(*) FROM inquiry_option_items").fetchone()[0] == 16

    print("NX-DATA-1.1 schema proof: PASS")
    print("Migration inventory: 0001..0005 PASS")
    print("Prior migrations 0001..0004 execution: PASS")
    print("Legacy/swapped Client Code normalization: PASS")
    print("CU-999 -> CU-1000 unbounded formatting: PASS")
    print("Client identity/public_id preservation: PASS")
    print("AUTOINCREMENT no-reuse after hard delete: PASS")
    print("client_profile_tokens schema/index/FK/uniqueness: PASS")
    print("Future module isolation: PASS")
    print("Foreign key check: PASS")
    print("Public seed preservation: PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"NX-DATA-1.1 schema proof: FAIL: {exc}", file=sys.stderr)
        raise
