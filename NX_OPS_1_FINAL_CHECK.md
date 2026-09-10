# NEXORA — NX-OPS-1 Final Engineering Check

## Gate

**Status: CODE / D1-COMPATIBLE INTEGRATION PASS — REMOTE CLOUDFLARE + REAL-BROWSER ACCEPTANCE PENDING OWNER EXECUTION**

NX-OPS-1 implements the Clients Admin/API domain and controlled Inquiry → Client conversion on top of the locked Phase 6.2 + NX-CORE-2 + NX-DATA-1 baseline.

No Client Projects, Tasks, Milestones, Tickets, Portal, Quotes, Invoices, or Payments are introduced.

## Baseline preservation

- Protected pre-existing NX-DATA-1 files: **99 / 99 byte-identical**.
- Public non-Admin website files: **35 / 35 byte-identical**.
- Unexpected protected-file changes: **0**.
- Existing D1 migrations changed: **0**.

Explicit runtime/UI change surface:

```text
src/api-router.js
src/modules/admin/inquiries.js
src/modules/operations/clients.js                      NEW

public/admin/index.html
public/admin/css/admin.css
public/admin/js/app.js
public/admin/js/core/i18n.js
public/admin/js/core/router.js
public/admin/js/core/state.js
public/admin/js/core/ui.js
public/admin/js/modules/inquiries.js
public/admin/js/modules/clients.js                    NEW
```

New tests/check/deploy documentation is outside the product runtime surface.

## D1 / migration gate

Migration inventory remains exactly:

```text
0001_schema.sql
0002_seed.sql
0003_inquiry_locale.sql
0004_clients_core.sql
```

There is **no 0005 migration** in NX-OPS-1.

All four migration SHA-256 hashes are locked to NX-DATA-1. `0004_clients_core.sql` is a prerequisite, not a new NX-OPS-1 schema change.

## API gate

Total exact API inventory after NX-OPS-1: **35 routes including OPTIONS**.

New authenticated Admin capabilities are limited to:

```text
Clients config/list/create/detail/update
Client contact create/update
Inquiry → Client conversion
```

Existing public and Admin contracts remain present.

There are no routes for:

```text
client-projects
tasks
milestones
tickets
quotes
invoices
portal
```

There are no Admin DELETE routes.

## Security / integrity verification

Verified by the NX-OPS-1 integration suite:

- unauthenticated Clients access rejected;
- state-changing Clients calls require CSRF;
- cross-origin Admin writes rejected;
- conversion specifically rejects missing CSRF and foreign Origin;
- client field/status/cursor validation;
- duplicate client code conflict;
- random non-sequential client/contact public IDs;
- contact creation/update;
- single-primary-contact service behavior;
- contact soft deactivate;
- `portal_enabled` remains `0` through Clients/contact/conversion operations;
- client archive + restore;
- archived client cannot receive a new Inquiry conversion;
- Inquiry → new Client conversion;
- Inquiry → existing Client conversion;
- conversion creates provenance mapping;
- conversion does not mutate Inquiry status;
- repeated conversion is idempotent and does not duplicate a Client;
- cursor pagination across >50 clients without page duplication;
- required audit actions recorded;
- SQLite `PRAGMA foreign_key_check` returns no violations.

## Compatibility verification

```text
Public / unauthenticated Worker parity     21 / 21 PASS
Existing authenticated Admin compatibility 10 / 10 PASS
Clients + conversion D1 integration                 PASS
JavaScript syntax                                     PASS
HTML duplicate IDs                                    PASS
CSS structure                                         PASS
```

The authenticated compatibility comparison ignores only the deliberately additive internal `conversion` field in Inquiry detail/update responses and its new read query. All pre-existing behavior is otherwise compared against the frozen Phase 6.2 fixture.

## Admin UX

Real visible views only:

```text
Overview
Inquiries
Clients
Portfolio Projects
Services
```

The sidebar is grouped as Sales vs Website to avoid confusing public Portfolio Projects with future internal Client Projects.

No future placeholder screens were added.

AR/EN client UI is implemented, including draft preservation for active Inquiry, conversion, Client, contact, and new-client forms when changing the Admin language. Existing Dark/Light behavior is reused.

## Public-site risk

The complete non-Admin public website remains byte-identical. NX-OPS-1 does not alter visitor layouts, public Projects semantics, public Services, or Contact rendering.

## Environment limitation / live gate

This build environment does not represent the owner's live Cloudflare account, so this report does **not** claim:

- remote `0004` migration state;
- live D1 persistence;
- production Worker deployment;
- real-browser Desktop/Tablet/Mobile acceptance.

Use the provided guarded deployment script only inside the existing bound NEXORA Cloudflare project after owner approval:

```powershell
.\scripts\APPLY_NX_OPS_1.ps1 -DeployRemote
```

Then complete the live acceptance checklist in `docs/NX_OPS_1_CLIENTS.md`.

## Decision

**NX-OPS-1 local engineering gate: PASS.**

**Next migration is blocked until live acceptance:** `NX-DATA-2 / 0005_client_projects.sql`.
