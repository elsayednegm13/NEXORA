-- NEXORA Technologies — NX-DATA-1.2 Client Code Alignment
-- Cloudflare D1 / SQLite semantics
-- Forward-only correction: the first real Client is CU-001 (id=1), never CU-000.
-- Existing migration 0005 is immutable because it has already been applied live.
-- Client Projects remain blocked and are reserved for a later migration number.

-- Two phases avoid UNIQUE collisions when historical/manual codes overlap.
UPDATE clients
SET client_code = NULL;

UPDATE clients
SET client_code = 'CU-' || printf('%03d', id);
