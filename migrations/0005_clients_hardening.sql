-- NEXORA Technologies — NX-DATA-1.1 Clients Hardening
-- Cloudflare D1 / SQLite semantics
-- Forward-only migration: secure client profile-completion token storage + one-time Client Code normalization.
-- Existing migrations 0001..0004 remain immutable. No Client Projects/Tasks/Tickets/Billing/Portal tables are introduced here.

CREATE TABLE IF NOT EXISTS client_profile_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  client_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  revoked_at TEXT,
  created_by_admin_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_client_profile_tokens_client_created
  ON client_profile_tokens(client_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_client_profile_tokens_expiry_state
  ON client_profile_tokens(expires_at, completed_at, revoked_at);

-- Normalize every already-committed Client Code to the owner-approved deterministic format.
-- Two phases avoid UNIQUE collisions when historical/manual codes happen to be swapped.
-- UNIQUE permits multiple NULLs in SQLite, so clearing first is collision-safe inside the migration transaction.
UPDATE clients
SET client_code = NULL;

UPDATE clients
SET client_code = 'CU-' || printf('%03d', id - 1);
