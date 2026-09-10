# NEXORA NX-OPS-1 — Canonical Live Reconciliation

## Purpose

This package reconciles the locked NX-OPS-1 engineering source with the already-deployed Cloudflare production environment without provisioning a new Worker or D1 database and without resetting Secrets.

Verified production identity supplied during the live forensic review:

- Worker: `nexoratechnologies`
- Active production version before NX-OPS-1: `6f0bc71f-de57-42c4-bd8d-c651b3db7d10`
- D1 binding: `DB`
- D1 database: `nexora-db`
- D1 UUID: `71c3bf88-b71d-465b-9032-5251a11fde64`
- Assets binding: `ASSETS`
- compatibility date: `2026-09-06`

## Reconciled files

1. `wrangler.jsonc`
   - retains the existing Worker/static-assets/vars/observability configuration;
   - adds only the already-verified existing D1 binding `DB -> nexora-db` with the verified UUID.
2. `tests/nx-ops-1/worker-integration.mjs`
   - replaces URL pathname handling with `fileURLToPath()` so the deterministic integration test works on Windows paths containing drive letters, spaces and non-ASCII characters.
3. `scripts/NX_OPS_1_LIVE_CHECK.mjs`
   - preserves the NX-OPS-1 deterministic gates;
   - requires every protected NX-DATA-1 file except `wrangler.jsonc` to remain byte-identical;
   - validates the canonical live config exactly against the verified existing Worker/D1 identity.
4. `scripts/APPLY_NX_OPS_1_LIVE.ps1`
   - default mode is read-only preflight;
   - verifies local engineering gates, Cloudflare login, exact existing D1 identity, remote migration state and production row counts;
   - `-DeployRemote` applies only pending migrations from the locked `0001..0004` inventory, verifies schema/FKs/counts, deploys the Worker/assets, and runs runtime checks;
   - never creates D1, never resets Secrets, never performs destructive SQL.

## Required gate order

Read-only preflight:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\APPLY_NX_OPS_1_LIVE.ps1
```

Only after the preflight output is reviewed:

```powershell
.\scripts\APPLY_NX_OPS_1_LIVE.ps1 -DeployRemote
```

NX-DATA-2 / `0005_client_projects.sql` remains blocked until NX-OPS-1 live deployment and real-browser acceptance are recorded.
