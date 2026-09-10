-- NEXORA Technologies — Cloudflare D1 schema
-- Phase 6.1 / SQLite semantics / Worker-native
CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage_disk TEXT NOT NULL DEFAULT 'remote',
  storage_path TEXT,
  url TEXT NOT NULL UNIQUE,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  checksum_sha256 TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_media_disk ON media_assets(storage_disk);

CREATE TABLE IF NOT EXISTS technologies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  icon_media_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (icon_media_id) REFERENCES media_assets(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_technology_active_order ON technologies(is_active,sort_order,id);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  short_description_ar TEXT,
  short_description_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  icon_key TEXT NOT NULL DEFAULT 'custom',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK(is_featured IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  seo_title_ar TEXT,
  seo_title_en TEXT,
  seo_description_ar TEXT,
  seo_description_en TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_service_public ON services(is_active,sort_order,id);

CREATE TABLE IF NOT EXISTS service_capabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id INTEGER NOT NULL,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_service_capabilities ON service_capabilities(service_id,is_active,sort_order,id);

CREATE TABLE IF NOT EXISTS service_technologies (
  service_id INTEGER NOT NULL,
  technology_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (service_id,technology_id),
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  FOREIGN KEY (technology_id) REFERENCES technologies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_service_technology_order ON service_technologies(service_id,sort_order);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  short_description_ar TEXT,
  short_description_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  challenge_ar TEXT,
  challenge_en TEXT,
  solution_ar TEXT,
  solution_en TEXT,
  website_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'live',
  cover_media_id INTEGER,
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK(is_featured IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  seo_title_ar TEXT,
  seo_title_en TEXT,
  seo_description_ar TEXT,
  seo_description_en TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cover_media_id) REFERENCES media_assets(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_project_public ON projects(is_active,sort_order,id);
CREATE INDEX IF NOT EXISTS idx_project_featured ON projects(is_active,is_featured,sort_order);

CREATE TABLE IF NOT EXISTS project_services (
  project_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id,service_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ps_service ON project_services(service_id,sort_order);

CREATE TABLE IF NOT EXISTS project_technologies (
  project_id INTEGER NOT NULL,
  technology_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id,technology_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (technology_id) REFERENCES technologies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pt_technology ON project_technologies(technology_id,sort_order);

CREATE TABLE IF NOT EXISTS project_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  media_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'gallery',
  alt_ar TEXT,
  alt_en TEXT,
  caption_ar TEXT,
  caption_en TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id,media_id,type),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_media_order ON project_media(project_id,is_active,sort_order,id);

CREATE TABLE IF NOT EXISTS project_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  value TEXT,
  label_ar TEXT NOT NULL,
  label_en TEXT NOT NULL,
  note_ar TEXT,
  note_en TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_result_order ON project_results(project_id,is_active,sort_order,id);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  role_ar TEXT,
  role_en TEXT,
  bio_ar TEXT,
  bio_en TEXT,
  avatar_media_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (avatar_media_id) REFERENCES media_assets(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_key TEXT NOT NULL UNIQUE,
  title_ar TEXT NOT NULL,
  title_en TEXT NOT NULL,
  description_ar TEXT,
  description_en TEXT,
  badge_ar TEXT,
  badge_en TEXT,
  pricing_mode TEXT NOT NULL DEFAULT 'quote',
  price_amount REAL,
  price_currency TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK(is_featured IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_package_public ON packages(is_active,sort_order,id);

CREATE TABLE IF NOT EXISTS package_features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER NOT NULL,
  label_ar TEXT NOT NULL,
  label_en TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_package_feature ON package_features(package_id,is_active,sort_order,id);

CREATE TABLE IF NOT EXISTS inquiry_option_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_key TEXT NOT NULL,
  option_key TEXT NOT NULL,
  label_ar TEXT,
  label_en TEXT,
  meta_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_key,option_key)
);
CREATE INDEX IF NOT EXISTS idx_inquiry_option_public ON inquiry_option_items(group_key,is_active,sort_order,id);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  client_request_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  project_stage_key TEXT NOT NULL,
  timeline_key TEXT NOT NULL,
  budget_mode_key TEXT NOT NULL,
  budget_amount REAL,
  budget_currency TEXT,
  description TEXT NOT NULL,
  reference_url TEXT,
  preferred_contact TEXT NOT NULL DEFAULT 'email',
  privacy_accepted_at TEXT NOT NULL,
  source_page TEXT,
  source_service_slug TEXT,
  source_package_key TEXT,
  source_project_slug TEXT,
  referrer TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  assigned_admin_id INTEGER,
  internal_notes TEXT,
  contacted_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_inquiry_status_created ON project_inquiries(status,created_at);
CREATE INDEX IF NOT EXISTS idx_inquiry_email ON project_inquiries(email);
CREATE INDEX IF NOT EXISTS idx_inquiry_assigned ON project_inquiries(assigned_admin_id,status);

CREATE TABLE IF NOT EXISTS project_inquiry_services (
  project_inquiry_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_inquiry_id,service_id),
  FOREIGN KEY (project_inquiry_id) REFERENCES project_inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_pis_service ON project_inquiry_services(service_id);

CREATE TABLE IF NOT EXISTS project_inquiry_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_inquiry_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by_admin_id INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_inquiry_id) REFERENCES project_inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_inquiry_history ON project_inquiry_status_history(project_inquiry_id,created_at,id);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rate_cleanup ON api_rate_limits(updated_at);

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key TEXT PRIMARY KEY,
  value_json TEXT,
  is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  request_id TEXT,
  ip_hash TEXT,
  context_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type,entity_id,created_at);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_logs(admin_user_id,created_at);
