-- NEXORA Technologies — NX-DATA-1 Clients Core
-- Cloudflare D1 / SQLite semantics
-- Additive, forward-only migration. No backfill, destructive DDL, or runtime data mutation.

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  client_code TEXT UNIQUE,
  client_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  legal_name TEXT,
  default_currency TEXT NOT NULL,
  preferred_language TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  billing_name TEXT,
  billing_email TEXT COLLATE NOCASE,
  billing_phone TEXT,
  billing_address_line1 TEXT,
  billing_address_line2 TEXT,
  billing_city TEXT,
  billing_region TEXT,
  billing_postal_code TEXT,
  billing_country_code TEXT,
  tax_identifier TEXT,
  created_by_admin_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_status_updated
  ON clients(status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_clients_display_name
  ON clients(display_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_clients_billing_email
  ON clients(billing_email COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS client_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT COLLATE NOCASE,
  phone TEXT,
  role_title TEXT,
  preferred_language TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  portal_enabled INTEGER NOT NULL DEFAULT 0 CHECK(portal_enabled IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_client_contacts_client_status
  ON client_contacts(client_id, status, is_primary DESC, id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_email
  ON client_contacts(email COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS inquiry_conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_inquiry_id INTEGER NOT NULL UNIQUE,
  client_id INTEGER NOT NULL,
  converted_by_admin_id INTEGER NOT NULL,
  converted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  context_json TEXT,
  FOREIGN KEY (project_inquiry_id) REFERENCES project_inquiries(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (converted_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_inquiry_conversions_client
  ON inquiry_conversions(client_id, converted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_inquiry_conversions_admin
  ON inquiry_conversions(converted_by_admin_id, converted_at DESC, id DESC);
