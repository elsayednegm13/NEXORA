-- NEXORA Technologies — NX-DATA-3 Client Project Execution
-- Cloudflare D1 / SQLite semantics
-- Additive, forward-only migration. No business-row backfill and no destructive DDL.
-- Workflow status/priority catalogs remain Worker/service-authoritative.

CREATE TABLE IF NOT EXISTS client_project_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  client_project_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
  target_date TEXT,
  completed_at TEXT,
  created_by_admin_id INTEGER NOT NULL,
  updated_by_admin_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  UNIQUE (client_project_id, id),
  FOREIGN KEY (client_project_id) REFERENCES client_projects(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_client_project_milestones_project_order
  ON client_project_milestones(client_project_id, archived_at, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_client_project_milestones_target
  ON client_project_milestones(client_project_id, target_date, id);

CREATE TABLE IF NOT EXISTS client_project_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  client_project_id INTEGER NOT NULL,
  milestone_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'normal',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
  start_date TEXT,
  due_date TEXT,
  completed_at TEXT,
  created_by_admin_id INTEGER NOT NULL,
  updated_by_admin_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT,
  UNIQUE (client_project_id, id),
  FOREIGN KEY (client_project_id) REFERENCES client_projects(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_project_id, milestone_id) REFERENCES client_project_milestones(client_project_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_client_project_tasks_project_status_due
  ON client_project_tasks(client_project_id, archived_at, status, due_date, id);
CREATE INDEX IF NOT EXISTS idx_client_project_tasks_milestone
  ON client_project_tasks(milestone_id, archived_at, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_client_project_tasks_due
  ON client_project_tasks(due_date, status, archived_at, id);

CREATE TABLE IF NOT EXISTS client_project_task_assignees (
  client_project_task_id INTEGER NOT NULL,
  client_project_id INTEGER NOT NULL,
  admin_user_id INTEGER NOT NULL,
  assigned_by_admin_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (client_project_task_id, admin_user_id),
  FOREIGN KEY (client_project_task_id, client_project_id) REFERENCES client_project_tasks(id, client_project_id) ON DELETE RESTRICT,
  FOREIGN KEY (client_project_id, admin_user_id) REFERENCES client_project_members(client_project_id, admin_user_id) ON DELETE RESTRICT,
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_client_project_task_assignees_admin
  ON client_project_task_assignees(admin_user_id, client_project_task_id);
