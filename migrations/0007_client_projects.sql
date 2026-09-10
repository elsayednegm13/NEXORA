-- NEXORA Technologies — NX-DATA-2 Client Projects
-- Cloudflare D1 / SQLite semantics
-- Additive, forward-only migration. No backfill, destructive DDL, runtime route, or UI change.
-- Public Portfolio `projects` remains a separate website/CMS domain.

CREATE TABLE IF NOT EXISTS client_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  project_code TEXT UNIQUE,
  client_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  priority TEXT NOT NULL DEFAULT 'normal',
  progress_mode TEXT NOT NULL DEFAULT 'manual',
  manual_progress_percent INTEGER CHECK(manual_progress_percent IS NULL OR (manual_progress_percent >= 0 AND manual_progress_percent <= 100)),
  start_date TEXT,
  target_date TEXT,
  completed_at TEXT,
  agreed_amount_minor INTEGER CHECK(agreed_amount_minor IS NULL OR agreed_amount_minor >= 0),
  currency TEXT,
  portal_visible INTEGER NOT NULL DEFAULT 0 CHECK(portal_visible IN (0,1)),
  created_by_admin_id INTEGER NOT NULL,
  updated_by_admin_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_client_projects_client_status_updated
  ON client_projects(client_id, status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_client_projects_status_updated
  ON client_projects(status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_client_projects_target_date
  ON client_projects(target_date, status, id);

CREATE TABLE IF NOT EXISTS client_project_services (
  client_project_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  scope_note TEXT,
  PRIMARY KEY (client_project_id, service_id),
  FOREIGN KEY (client_project_id) REFERENCES client_projects(id) ON DELETE RESTRICT,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_client_project_services_service
  ON client_project_services(service_id, client_project_id);
CREATE INDEX IF NOT EXISTS idx_client_project_services_order
  ON client_project_services(client_project_id, sort_order, service_id);

CREATE TABLE IF NOT EXISTS client_project_members (
  client_project_id INTEGER NOT NULL,
  admin_user_id INTEGER NOT NULL,
  role_key TEXT,
  is_lead INTEGER NOT NULL DEFAULT 0 CHECK(is_lead IN (0,1)),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (client_project_id, admin_user_id),
  FOREIGN KEY (client_project_id) REFERENCES client_projects(id) ON DELETE RESTRICT,
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_client_project_members_admin
  ON client_project_members(admin_user_id, client_project_id);
CREATE INDEX IF NOT EXISTS idx_client_project_members_lead
  ON client_project_members(client_project_id, is_lead DESC, admin_user_id);

CREATE TABLE IF NOT EXISTS inquiry_project_links (
  project_inquiry_id INTEGER NOT NULL,
  client_project_id INTEGER NOT NULL,
  linked_by_admin_id INTEGER NOT NULL,
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_inquiry_id, client_project_id),
  FOREIGN KEY (project_inquiry_id) REFERENCES project_inquiries(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_project_id) REFERENCES client_projects(id) ON DELETE RESTRICT,
  FOREIGN KEY (linked_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_inquiry_project_links_project
  ON inquiry_project_links(client_project_id, linked_at DESC, project_inquiry_id);
CREATE INDEX IF NOT EXISTS idx_inquiry_project_links_admin
  ON inquiry_project_links(linked_by_admin_id, linked_at DESC, project_inquiry_id);
