# NEXORA — NX-OPS-2 Client Project Workspace

## Decision
NX-OPS-2 turns the already-Live `0007_client_projects.sql` schema into a real Admin operations workspace. It does **not** change the public Portfolio domain. `/api/v1/projects` and Admin Portfolio Projects remain Website/CMS data; internal delivery work uses `/api/v1/admin/client-projects` and the `client_projects` family only.

## Scope
- Admin Client Projects list, search, filters and cursor pagination (50 rows/page).
- Create and edit internal Client Projects.
- Project detail/workspace drawer.
- Link one immutable Client at creation time.
- Services and Admin-member assignments.
- One logical project lead among assigned members.
- Inquiry provenance linking after the Inquiry has been converted to the same Client.
- Status, priority, start date, target date and manual progress.
- Contextual agreed amount stored as integer `agreed_amount_minor` plus currency.
- Archive / restore lifecycle; no project hard-delete route.
- AR/EN, RTL/LTR, Dark/Light and responsive Admin behavior.

## Explicitly excluded
NX-OPS-2 does not introduce Tasks, Milestones, operation Events, Tickets/SLA, Quotes, Invoices, Payments, Client Portal authority, Portal sessions, or private files. `portal_visible` stays server-owned at `0` and is not an access grant.

## Identity
`public_id` is random/non-sequential (`cpr_...`) and remains the external-safe identity. `project_code` is a server-authoritative human-readable operational code generated after insertion as `PRJ-{id}` with minimum 3-digit padding:
- id=1 → `PRJ-001`
- id=999 → `PRJ-999`
- id=1000 → `PRJ-1000`

No max is imposed and codes are not browser-controlled. The `0007` schema intentionally left `project_code` nullable/unique so the runtime allocator could be decided here without rewriting an applied migration.

## Workflow authority
Statuses: `planning`, `active`, `on_hold`, `completed`, `cancelled`.
Priorities: `low`, `normal`, `high`, `urgent`.
Progress mode: `manual` only in this gate.

Transitions are owned by Worker/service logic, not D1 CHECK constraints:
- planning → active / on_hold / cancelled
- active → on_hold / completed / cancelled
- on_hold → active / cancelled
- completed → active
- cancelled → planning

Create always starts in `planning`. Completing forces manual progress to 100 and sets `completed_at`; reopening clears `completed_at`. Archived projects are read-only until restored.

## Money contract
The browser sends an amount string, never an authoritative floating-point value. The Worker validates at most two decimal places and converts the value to integer minor units before D1 persistence. The amount is project-context only and is **not Billing authority**. Billing/Invoices/Payments remain out of scope.

## Relations
- Client ownership is immutable after project creation.
- A new project can only be created for an active Client.
- Services/member assignments are mutable association sets.
- Inquiry provenance is append-only and idempotent; there is no unlink route in NX-OPS-2.
- An Inquiry can be linked only after conversion to the exact same Client.
- Existing guarded Client permanent deletion dynamically detects `client_projects` and blocks deletion when operational history exists.

## API contract
- `GET /api/v1/admin/client-projects/config`
- `GET /api/v1/admin/client-projects`
- `POST /api/v1/admin/client-projects`
- `GET /api/v1/admin/client-projects/:id`
- `POST /api/v1/admin/client-projects/:id/update`
- `PATCH /api/v1/admin/client-projects/:id`
- `POST /api/v1/admin/client-projects/:id/lifecycle`
- `GET /api/v1/admin/client-projects/:id/inquiry-options`
- `POST /api/v1/admin/client-projects/:id/inquiries/link`

All mutation routes retain Admin auth, same-origin and CSRF enforcement. No HTTP DELETE route is added.

## UI/UX contract
Operations receives a real `Client Projects` view only because the feature is functional. No future empty navigation items are introduced. Primary NEXORA blue CTA buttons retain white text/icons. Toasts remain concise user-facing results only; technical implementation details are excluded. Critical archive/restore decisions use the existing themed confirmation system, never `window.confirm()`.

## Tooling closeout carried forward
Two NX-DATA-2 deployment-tool issues discovered during the Live apply are corrected without changing business behavior:
1. `.wrangler` runtime cache is ignored by source-inventory gates.
2. Wrangler empty output for `PRAGMA foreign_key_check` is treated as zero violations instead of assuming a `results` property always exists.

## Deployment boundary
NX-OPS-2 is code/assets only. `0007_client_projects.sql` is already Live and immutable. `APPLY_NX_OPS_2.ps1` verifies there are no pending migrations and never applies a migration.


## R1 Windows Wrangler invocation hardening

After Live preflight evidence on Windows, the PowerShell `npx.ps1` shim triggered a native Node/libuv assertion while executing a read-only D1 count query. No Worker deployment or business-data write had started. `APPLY_NX_OPS_2.ps1` now bypasses the PowerShell shim: it prefers the project's direct `node_modules\.bin\wrangler.cmd` and falls back to `npx.cmd` only when the local Wrangler executable is unavailable. The engineering/API/schema scope is unchanged and no migration was added.


## Clean release execution (R2)

Use `scripts/RUN_NX_OPS_2_RELEASE.ps1` for both preflight and deployment. The runner validates release hashes, creates a clean temporary stage containing only approved release files, uses isolated pinned Wrangler `4.129.1`, and then invokes the NX-OPS-2 gate/deploy script. This makes execution independent of stale `.wrangler`, `node_modules`, or unrelated files in an older working directory.

## R4 release-tooling hardening

The Live D1 environment rejected a nine-term `UNION ALL` used only by the release count gate (`too many terms in compound SELECT`). All nine equivalent single-table `COUNT(*)` probes succeeded. R4 therefore uses explicit per-table read-only count snapshots before and after deploy and does not depend on compound-SELECT term limits. This does not change NX-OPS-2 API/UI/business logic or any migration.
