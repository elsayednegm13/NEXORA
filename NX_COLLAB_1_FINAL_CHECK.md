# NX-COLLAB-1 R3 — Final Local Engineering Check

**Remote state:** unchanged by package construction and local verification.

## Current live state before R3 deployment

- Private R2 bucket `nexora-project-files`: already created.
- `0010_client_project_collaboration.sql`: already applied successfully to the existing D1 database.
- No NX-COLLAB-1 Worker code deployment has completed yet.
- The R2 read-only preflight reached Cloudflare correctly, then one D1 `COUNT(*)` command for `client_project_folders` returned Wrangler transport text `fetch failed`.

## R3 correction

R3 is release-tooling-only. It does not change Worker business logic, Admin/Portal UI, migration bytes, schema, R2 configuration, Durable Object implementation, API routes, or application data behavior.

`Get-RemoteCount` now retries only recognized transient read failures (`fetch failed`, connection reset/timeout/socket/network failures, and HTTP 502/503/504) up to four attempts with bounded exponential delays of 2, 4 and 8 seconds. SQL/schema/guard failures still fail immediately and are never masked.

## Preserved R2 deployment correction

- Deployment entrypoint remains `./src/cloudflare-worker.js`.
- `ProjectRealtimeRoom` remains exported from the deployment entrypoint.
- Node integration-test entrypoint remains Cloudflare-import free.
- Mandatory staged `wrangler deploy --dry-run` remains before any Cloudflare action.

## Local gate evidence

- NX-OPS-4 R2 protected baseline outside approved surface: PASS.
- Migrations `0001..0010` exact: PASS.
- Migrations `0001..0009` byte-identical: PASS.
- `0010` additive-only and byte-identical to the applied R1/R2 migration: PASS.
- D1 schema/FK/idempotency/file metadata proof: PASS.
- Historical full-schema regression through `0010`: PASS.
- Public Worker parity: 21/21 PASS.
- Existing authenticated Admin compatibility: 10/10 PASS.
- NX-COLLAB-1 Worker integration: PASS.
- NX-COLLAB-1 UI contract: PASS.
- API route guard inventory: 89 exact.
- HTTP DELETE routes: none.
- Runtime JS syntax: PASS.
- HTML duplicate IDs: PASS.
- Release-critical PowerShell scripts: ASCII-safe.
- Read-only D1 retry/backoff contract: PASS.

## Owner order

Run the default read-only release command first. Because R2 infrastructure and `0010` are already live, the expected result is the CODE GATE. Only after owner review should `-DeployRemote` be used.
