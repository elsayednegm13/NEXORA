-- NEXORA Technologies — NX-DATA-5 Client Collaboration + Private Project Files
-- Cloudflare D1 / SQLite semantics
-- Additive, forward-only migration. No destructive DDL and no business-row backfill.
-- Binary file bytes remain in private Cloudflare R2; D1 stores metadata and relations only.
-- Workflow/state catalogs remain Worker/service-authoritative.

ALTER TABLE client_project_tickets ADD COLUMN client_request_id TEXT;
ALTER TABLE client_project_ticket_messages ADD COLUMN client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_project_tickets_request_id
  ON client_project_tickets(client_project_id, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_project_ticket_messages_request_id
  ON client_project_ticket_messages(ticket_id, client_request_id) WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS client_project_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  client_project_id INTEGER NOT NULL,
  parent_folder_id INTEGER,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_admin_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  FOREIGN KEY (client_project_id) REFERENCES client_projects(id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_folder_id) REFERENCES client_project_folders(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_client_project_folders_project ON client_project_folders(client_project_id, archived_at, parent_folder_id, sort_order, id);

CREATE TABLE IF NOT EXISTS client_project_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  client_project_id INTEGER NOT NULL,
  folder_id INTEGER,
  display_name TEXT NOT NULL,
  file_kind TEXT NOT NULL DEFAULT 'file',
  visibility TEXT NOT NULL DEFAULT 'client',
  source_type TEXT NOT NULL,
  source_ticket_id INTEGER,
  source_message_id INTEGER,
  created_by_type TEXT NOT NULL,
  created_by_admin_id INTEGER,
  created_by_contact_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  FOREIGN KEY (client_project_id) REFERENCES client_projects(id) ON DELETE RESTRICT,
  FOREIGN KEY (folder_id) REFERENCES client_project_folders(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_ticket_id) REFERENCES client_project_tickets(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_message_id) REFERENCES client_project_ticket_messages(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_contact_id) REFERENCES client_contacts(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_client_project_files_project ON client_project_files(client_project_id, archived_at, folder_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_client_project_files_ticket ON client_project_files(source_ticket_id, archived_at, id DESC);

CREATE TABLE IF NOT EXISTS client_project_file_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  file_id INTEGER NOT NULL,
  version_no INTEGER NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256_hex TEXT NOT NULL,
  r2_etag TEXT,
  r2_version TEXT,
  client_request_id TEXT,
  created_by_type TEXT NOT NULL,
  created_by_admin_id INTEGER,
  created_by_contact_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (file_id, version_no),
  FOREIGN KEY (file_id) REFERENCES client_project_files(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_contact_id) REFERENCES client_contacts(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_project_file_versions_request ON client_project_file_versions(client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_project_file_versions_file ON client_project_file_versions(file_id, version_no DESC, id DESC);

CREATE TABLE IF NOT EXISTS client_project_ticket_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  message_id INTEGER,
  file_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (ticket_id, message_id, file_id),
  FOREIGN KEY (ticket_id) REFERENCES client_project_tickets(id) ON DELETE RESTRICT,
  FOREIGN KEY (message_id) REFERENCES client_project_ticket_messages(id) ON DELETE RESTRICT,
  FOREIGN KEY (file_id) REFERENCES client_project_files(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_client_project_ticket_attachments_ticket ON client_project_ticket_attachments(ticket_id, message_id, id);
CREATE INDEX IF NOT EXISTS idx_client_project_ticket_attachments_file ON client_project_ticket_attachments(file_id, id);
