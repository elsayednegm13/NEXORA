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
    "0006_clients_code_alignment.sql",
    "0007_client_projects.sql",
]
NEW_TABLES = {
    "client_projects",
    "client_project_services",
    "client_project_members",
    "inquiry_project_links",
}
FORBIDDEN_FUTURE_TABLES = {
    "project_milestones",
    "project_tasks",
    "client_project_notes",
    "operation_events",
    "portal_access_grants",
    "client_portal_sessions",
    "service_tickets",
    "ticket_messages",
    "quotes",
    "quote_items",
    "invoices",
    "invoice_items",
    "payments",
    "file_assets",
    "private_files",
}


def migration_files() -> list[Path]:
    files = sorted(MIGRATIONS.glob("*.sql"))
    names = [p.name for p in files]
    assert names == EXPECTED_MIGRATIONS, f"Migration inventory mismatch: {names}"
    return files


def columns(conn: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]


def index_names(conn: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA index_list({table})")}


def foreign_keys(conn: sqlite3.Connection, table: str) -> set[tuple[str, str, str, str]]:
    return {(r[3], r[2], r[4], r[6]) for r in conn.execute(f"PRAGMA foreign_key_list({table})")}


def expect_integrity_error(fn, message: str) -> None:
    try:
        fn()
    except sqlite3.IntegrityError:
        return
    raise AssertionError(message)


def main() -> None:
    files = migration_files()
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON")

    # Capture the accepted Portfolio schema before Client Projects exists.
    for path in files[:-1]:
        conn.executescript(path.read_text(encoding="utf-8"))
    portfolio_columns_before = columns(conn, "projects")
    protected_seed_before = {
        "services": conn.execute("SELECT COUNT(*) FROM services").fetchone()[0],
        "projects": conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0],
        "inquiry_option_items": conn.execute("SELECT COUNT(*) FROM inquiry_option_items").fetchone()[0],
    }
    assert protected_seed_before == {"services": 5, "projects": 12, "inquiry_option_items": 16}

    migration_0007 = MIGRATIONS / "0007_client_projects.sql"
    conn.executescript(migration_0007.read_text(encoding="utf-8"))
    # CREATE IF NOT EXISTS makes disposable repeat-apply validation safe.
    conn.executescript(migration_0007.read_text(encoding="utf-8"))

    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    assert columns(conn, "projects") == portfolio_columns_before, "Public Portfolio projects schema changed"

    protected_seed_after = {
        "services": conn.execute("SELECT COUNT(*) FROM services").fetchone()[0],
        "projects": conn.execute("SELECT COUNT(*) FROM projects").fetchone()[0],
        "inquiry_option_items": conn.execute("SELECT COUNT(*) FROM inquiry_option_items").fetchone()[0],
    }
    assert protected_seed_after == protected_seed_before, "Protected Phase 6.2 seed changed"

    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert NEW_TABLES <= tables, f"Missing Client Projects tables: {NEW_TABLES - tables}"
    assert not (FORBIDDEN_FUTURE_TABLES & tables), f"Future tables introduced early: {FORBIDDEN_FUTURE_TABLES & tables}"
    for table in NEW_TABLES:
        assert conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0, f"{table} is not empty after migration"

    expected_project_columns = [
        "id", "public_id", "project_code", "client_id", "name", "description",
        "status", "priority", "progress_mode", "manual_progress_percent",
        "start_date", "target_date", "completed_at", "agreed_amount_minor",
        "currency", "portal_visible", "created_by_admin_id", "updated_by_admin_id",
        "created_at", "updated_at", "archived_at",
    ]
    assert columns(conn, "client_projects") == expected_project_columns
    assert set(columns(conn, "client_project_services")) == {"client_project_id", "service_id", "sort_order", "scope_note"}
    assert set(columns(conn, "client_project_members")) == {"client_project_id", "admin_user_id", "role_key", "is_lead", "joined_at"}
    assert set(columns(conn, "inquiry_project_links")) == {"project_inquiry_id", "client_project_id", "linked_by_admin_id", "linked_at"}

    required_indexes = {
        "client_projects": {
            "idx_client_projects_client_status_updated",
            "idx_client_projects_status_updated",
            "idx_client_projects_target_date",
        },
        "client_project_services": {
            "idx_client_project_services_service",
            "idx_client_project_services_order",
        },
        "client_project_members": {
            "idx_client_project_members_admin",
            "idx_client_project_members_lead",
        },
        "inquiry_project_links": {
            "idx_inquiry_project_links_project",
            "idx_inquiry_project_links_admin",
        },
    }
    for table, required in required_indexes.items():
        missing = required - index_names(conn, table)
        assert not missing, f"Missing indexes for {table}: {missing}"

    assert ("client_id", "clients", "id", "RESTRICT") in foreign_keys(conn, "client_projects")
    assert ("created_by_admin_id", "admin_users", "id", "RESTRICT") in foreign_keys(conn, "client_projects")
    assert ("updated_by_admin_id", "admin_users", "id", "SET NULL") in foreign_keys(conn, "client_projects")
    assert ("client_project_id", "client_projects", "id", "RESTRICT") in foreign_keys(conn, "client_project_services")
    assert ("service_id", "services", "id", "RESTRICT") in foreign_keys(conn, "client_project_services")
    assert ("client_project_id", "client_projects", "id", "RESTRICT") in foreign_keys(conn, "client_project_members")
    assert ("admin_user_id", "admin_users", "id", "RESTRICT") in foreign_keys(conn, "client_project_members")
    assert ("project_inquiry_id", "project_inquiries", "id", "RESTRICT") in foreign_keys(conn, "inquiry_project_links")
    assert ("client_project_id", "client_projects", "id", "RESTRICT") in foreign_keys(conn, "inquiry_project_links")
    assert ("linked_by_admin_id", "admin_users", "id", "RESTRICT") in foreign_keys(conn, "inquiry_project_links")

    # Disposable fixtures exercise identity, provenance, constraints, and delete protection.
    conn.execute("INSERT INTO admin_users(name,email,password_hash,is_active) VALUES (?,?,?,1)", ("NX Admin", "nx-data2-admin@test.invalid", "test"))
    admin_id = conn.execute("SELECT id FROM admin_users WHERE email=?", ("nx-data2-admin@test.invalid",)).fetchone()[0]
    conn.execute("INSERT INTO admin_users(name,email,password_hash,is_active) VALUES (?,?,?,1)", ("Updater", "nx-data2-updater@test.invalid", "test"))
    updater_id = conn.execute("SELECT id FROM admin_users WHERE email=?", ("nx-data2-updater@test.invalid",)).fetchone()[0]

    conn.execute(
        """
        INSERT INTO clients(public_id,client_code,client_type,display_name,default_currency,preferred_language,status,created_by_admin_id)
        VALUES (?,?,?,?,?,?,?,?)
        """,
        ("cli_nx_data2", "CU-001", "company", "NX Data 2 Client", "EGP", "en", "active", admin_id),
    )
    client_id = conn.execute("SELECT id FROM clients WHERE public_id='cli_nx_data2'").fetchone()[0]

    conn.execute(
        """
        INSERT INTO project_inquiries(
          public_id,client_request_id,name,email,project_stage_key,timeline_key,budget_mode_key,
          description,preferred_contact,privacy_accepted_at,status,submission_language
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        ("inq_nx_data2", "req_nx_data2", "Lead", "lead@test.invalid", "idea", "flexible", "not_sure", "Test", "email", "2026-09-08T00:00:00Z", "qualified", "en"),
    )
    inquiry_id = conn.execute("SELECT id FROM project_inquiries WHERE public_id='inq_nx_data2'").fetchone()[0]
    service_id = conn.execute("SELECT id FROM services ORDER BY id LIMIT 1").fetchone()[0]

    conn.execute(
        """
        INSERT INTO client_projects(
          public_id,project_code,client_id,name,description,status,priority,progress_mode,
          manual_progress_percent,start_date,target_date,agreed_amount_minor,currency,portal_visible,
          created_by_admin_id,updated_by_admin_id
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        ("cpj_nx_data2_a", "NXP-TEST-A", client_id, "Internal Project A", "Schema proof", "planning", "normal", "manual", 35, "2026-09-08", "2026-10-08", 125000, "EGP", 0, admin_id, updater_id),
    )
    project_a = conn.execute("SELECT id FROM client_projects WHERE public_id='cpj_nx_data2_a'").fetchone()[0]
    conn.execute("INSERT INTO client_project_services(client_project_id,service_id,sort_order,scope_note) VALUES (?,?,?,?)", (project_a, service_id, 0, "Internal scope classification"))
    conn.execute("INSERT INTO client_project_members(client_project_id,admin_user_id,role_key,is_lead) VALUES (?,?,?,?)", (project_a, admin_id, "delivery", 1))
    conn.execute("INSERT INTO inquiry_project_links(project_inquiry_id,client_project_id,linked_by_admin_id) VALUES (?,?,?)", (inquiry_id, project_a, admin_id))

    # One Inquiry can legitimately result in multiple internal Client Projects.
    conn.execute(
        """
        INSERT INTO client_projects(public_id,project_code,client_id,name,status,priority,progress_mode,manual_progress_percent,portal_visible,created_by_admin_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        """,
        ("cpj_nx_data2_b", "NXP-TEST-B", client_id, "Internal Project B", "planning", "high", "manual", 0, 0, admin_id),
    )
    project_b = conn.execute("SELECT id FROM client_projects WHERE public_id='cpj_nx_data2_b'").fetchone()[0]
    conn.execute("INSERT INTO inquiry_project_links(project_inquiry_id,client_project_id,linked_by_admin_id) VALUES (?,?,?)", (inquiry_id, project_b, admin_id))
    assert conn.execute("SELECT COUNT(*) FROM inquiry_project_links WHERE project_inquiry_id=?", (inquiry_id,)).fetchone()[0] == 2

    # Workflow catalogs remain service-authoritative rather than frozen in DB checks.
    conn.execute(
        """
        INSERT INTO client_projects(public_id,client_id,name,status,priority,progress_mode,portal_visible,created_by_admin_id)
        VALUES (?,?,?,?,?,?,?,?)
        """,
        ("cpj_nx_data2_future", client_id, "Future State", "future_status", "future_priority", "future_mode", 0, admin_id),
    )

    expect_integrity_error(
        lambda: conn.execute("INSERT INTO client_projects(public_id,client_id,name,status,priority,progress_mode,portal_visible,created_by_admin_id) VALUES (?,?,?,?,?,?,?,?)", ("cpj_nx_data2_a", client_id, "Duplicate", "planning", "normal", "manual", 0, admin_id)),
        "Duplicate client-project public_id was accepted",
    )
    expect_integrity_error(
        lambda: conn.execute("INSERT INTO client_projects(public_id,project_code,client_id,name,status,priority,progress_mode,portal_visible,created_by_admin_id) VALUES (?,?,?,?,?,?,?,?,?)", ("cpj_dup_code", "NXP-TEST-A", client_id, "Duplicate Code", "planning", "normal", "manual", 0, admin_id)),
        "Duplicate project_code was accepted",
    )
    expect_integrity_error(
        lambda: conn.execute("INSERT INTO inquiry_project_links(project_inquiry_id,client_project_id,linked_by_admin_id) VALUES (?,?,?)", (inquiry_id, project_a, admin_id)),
        "Duplicate inquiry/project provenance link was accepted",
    )
    expect_integrity_error(
        lambda: conn.execute("INSERT INTO client_projects(public_id,client_id,name,status,priority,progress_mode,manual_progress_percent,portal_visible,created_by_admin_id) VALUES (?,?,?,?,?,?,?,?,?)", ("cpj_bad_progress", client_id, "Bad Progress", "planning", "normal", "manual", 101, 0, admin_id)),
        "manual_progress_percent > 100 was accepted",
    )
    expect_integrity_error(
        lambda: conn.execute("INSERT INTO client_projects(public_id,client_id,name,status,priority,progress_mode,agreed_amount_minor,portal_visible,created_by_admin_id) VALUES (?,?,?,?,?,?,?,?,?)", ("cpj_bad_amount", client_id, "Bad Amount", "planning", "normal", "manual", -1, 0, admin_id)),
        "negative agreed_amount_minor was accepted",
    )
    expect_integrity_error(
        lambda: conn.execute("INSERT INTO client_projects(public_id,client_id,name,status,priority,progress_mode,portal_visible,created_by_admin_id) VALUES (?,?,?,?,?,?,?,?)", ("cpj_bad_portal", client_id, "Bad Portal", "planning", "normal", "manual", 2, admin_id)),
        "portal_visible outside 0/1 was accepted",
    )

    # updated_by alone is intentionally nullable on Admin removal.
    conn.execute("DELETE FROM admin_users WHERE id=?", (updater_id,))
    assert conn.execute("SELECT updated_by_admin_id FROM client_projects WHERE id=?", (project_a,)).fetchone()[0] is None

    # Historical/operational relations reject accidental hard deletion.
    expect_integrity_error(lambda: conn.execute("DELETE FROM clients WHERE id=?", (client_id,)), "Referenced client hard delete was accepted")
    expect_integrity_error(lambda: conn.execute("DELETE FROM project_inquiries WHERE id=?", (inquiry_id,)), "Linked inquiry hard delete was accepted")
    expect_integrity_error(lambda: conn.execute("DELETE FROM services WHERE id=?", (service_id,)), "Referenced service hard delete was accepted")
    expect_integrity_error(lambda: conn.execute("DELETE FROM admin_users WHERE id=?", (admin_id,)), "Referenced admin hard delete was accepted")
    expect_integrity_error(lambda: conn.execute("DELETE FROM client_projects WHERE id=?", (project_a,)), "Referenced client project hard delete was accepted")

    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []

    print("NX-DATA-2 schema proof: PASS")
    print("Migration inventory: 0001..0007 PASS")
    print("0007 repeat-apply safety: PASS")
    print("Portfolio projects schema isolation: PASS")
    print("Protected Phase 6.2 seed preservation: PASS")
    print("Client Project tables start empty: PASS")
    print("Client Project columns/indexes/FKs: PASS")
    print("Project public_id/project_code uniqueness: PASS")
    print("Inquiry -> multiple Client Projects provenance: PASS")
    print("Progress/amount/boolean stable invariants: PASS")
    print("Workflow catalogs remain service-authoritative: PASS")
    print("Restrictive historical/operational delete behavior: PASS")
    print("Foreign key check: PASS")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"NX-DATA-2 schema proof: FAIL: {exc}", file=sys.stderr)
        raise
