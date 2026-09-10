-- NEXORA Technologies — NX-DATA-4 Client Project Portal + Support Foundation
-- Cloudflare D1 / SQLite semantics
-- Additive, forward-only migration. No destructive DDL and no business-row backfill.
-- Public Portfolio `projects` remains separate from internal `client_projects`.
-- Workflow catalogs remain Worker/service-authoritative.

ALTER TABLE client_project_milestones
  ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 0 CHECK(client_visible IN (0,1));

ALTER TABLE client_project_tasks
  ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 0 CHECK(client_visible IN (0,1));

CREATE INDEX IF NOT EXISTS idx_client_project_milestones_client_visible
  ON client_project_milestones(client_project_id, client_visible, archived_at, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_client_project_tasks_client_visible
  ON client_project_tasks(client_project_id, client_visible, archived_at, status, sort_order, id);

CREATE TABLE IF NOT EXISTS client_project_access_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  client_project_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  client_contact_id INTEGER,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  can_view_progress INTEGER NOT NULL DEFAULT 1 CHECK(can_view_progress IN (0,1)),
  can_view_milestones INTEGER NOT NULL DEFAULT 1 CHECK(can_view_milestones IN (0,1)),
  can_view_tasks INTEGER NOT NULL DEFAULT 1 CHECK(can_view_tasks IN (0,1)),
  can_submit_tickets INTEGER NOT NULL DEFAULT 1 CHECK(can_submit_tickets IN (0,1)),
  can_comment_tickets INTEGER NOT NULL DEFAULT 1 CHECK(can_comment_tickets IN (0,1)),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT,
  created_by_admin_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_project_id) REFERENCES client_projects(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_contact_id) REFERENCES client_contacts(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_client_project_access_grants_project
  ON client_project_access_grants(client_project_id, revoked_at, expires_at, id DESC);
CREATE INDEX IF NOT EXISTS idx_client_project_access_grants_client
  ON client_project_access_grants(client_id, client_project_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_client_project_access_grants_contact
  ON client_project_access_grants(client_contact_id, client_project_id, id DESC);

CREATE TABLE IF NOT EXISTS client_portal_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  access_grant_id INTEGER NOT NULL,
  session_hash TEXT NOT NULL UNIQUE,
  csrf_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (access_grant_id) REFERENCES client_project_access_grants(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_client_portal_sessions_grant
  ON client_portal_sessions(access_grant_id, revoked_at, expires_at, id DESC);
CREATE INDEX IF NOT EXISTS idx_client_portal_sessions_expiry
  ON client_portal_sessions(expires_at, revoked_at, id);

CREATE TABLE IF NOT EXISTS client_project_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  ticket_code TEXT UNIQUE,
  client_project_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'issue',
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_admin_id INTEGER,
  created_by_type TEXT NOT NULL,
  created_by_admin_id INTEGER,
  created_by_contact_id INTEGER,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  UNIQUE (client_project_id, id),
  FOREIGN KEY (client_project_id) REFERENCES client_projects(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_contact_id) REFERENCES client_contacts(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_client_project_tickets_project_status
  ON client_project_tickets(client_project_id, archived_at, status, priority, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_client_project_tickets_client
  ON client_project_tickets(client_id, archived_at, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_client_project_tickets_assignee
  ON client_project_tickets(assigned_admin_id, status, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS client_project_ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  ticket_id INTEGER NOT NULL,
  author_type TEXT NOT NULL,
  author_admin_id INTEGER,
  author_contact_id INTEGER,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'client',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at TEXT,
  FOREIGN KEY (ticket_id) REFERENCES client_project_tickets(id) ON DELETE RESTRICT,
  FOREIGN KEY (author_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (author_contact_id) REFERENCES client_contacts(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_client_project_ticket_messages_ticket
  ON client_project_ticket_messages(ticket_id, created_at, id);

CREATE TABLE IF NOT EXISTS client_project_ticket_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  actor_type TEXT NOT NULL,
  actor_admin_id INTEGER,
  actor_contact_id INTEGER,
  event_type TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  visibility TEXT NOT NULL DEFAULT 'client',
  context_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES client_project_tickets(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_contact_id) REFERENCES client_contacts(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_client_project_ticket_events_ticket
  ON client_project_ticket_events(ticket_id, created_at, id);
