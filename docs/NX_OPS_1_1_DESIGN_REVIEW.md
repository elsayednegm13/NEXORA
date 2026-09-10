# NEXORA — NX-OPS-1.1 Clients Hardening + Secure Profile Completion

**Mode:** Read-only architecture/design review. No runtime, D1, migration, Worker, or Live data change is performed by this document.

## 1. Current accepted baseline inspected

Inspected source baseline: `NEXORA_NX_OPS_1_VISUAL_HOTFIX` (NX-OPS-1 Live-ready + accepted select Dark/Light hotfix).

Current deterministic gate rerun before design:

```text
NX-OPS-1 LIVE CHECK: PASS
Public / unauthenticated Worker parity: 21/21 PASS
Existing authenticated Admin compatibility: 10/10 PASS
Clients + Inquiry conversion integration: PASS
Migration inventory: 0001..0004 only
```

Current live schema contract from `0004_clients_core.sql` already contains:

- `clients.id INTEGER PRIMARY KEY AUTOINCREMENT`
- nullable unique `clients.client_code`
- `client_type`
- `tax_identifier`
- billing/profile fields
- `client_contacts`
- `inquiry_conversions`

Current runtime currently allows `client_code` to be supplied/edited by the browser. Current UI always renders `tax_identifier` regardless of client type. Current Client status storage is `active | on_hold | archived`.

---

## 2. Owner-approved target behavior

### Client creation ownership

- Only Admin creates a Client operational record.
- The client never self-registers a new Client.
- After Admin creation, Admin may generate a secure profile-completion link bound to that exact Client.
- The client may complete only an allowlisted subset of profile/contact fields.
- This feature is **not** Client Portal access.

### Client Code

System-generated only:

```text
CU-000
CU-001
...
CU-999
CU-1000
CU-1001
...
```

`000` is minimum display width, not a maximum.

No code is ever reused. Permanent deletion never resequences IDs/codes.

### Client type / Tax Identifier

```text
individual -> Tax Identifier is not rendered and authoritative value must be NULL
company    -> Tax Identifier is rendered and may be stored
```

If Admin changes a Client from `company` to `individual` and a Tax Identifier exists, UI must explicitly confirm that the Tax Identifier will be cleared. No silent hidden-data deletion.

### Lifecycle

Admin must have explicit actions:

- Activate / Reactivate
- Deactivate (stored as existing `on_hold` for backward compatibility)
- Archive
- Restore
- Permanent Delete (guarded; not universally allowed)

---

## 3. Client Code design decision

### Source of truth

Use the existing AUTOINCREMENT `clients.id` as the authoritative monotonic identity and derive the code as:

```text
client_number = id - 1
client_code   = "CU-" + client_number padded to minimum 3 digits
```

Examples:

```text
id=1     -> CU-000
id=2     -> CU-001
id=1000  -> CU-999
id=1001  -> CU-1000
```

This naturally continues without an artificial upper bound.

### Deletion behavior

If:

```text
CU-000
CU-001
CU-002
```

and `CU-001` is permanently deleted, the next Client remains `CU-003` (assuming its DB id is 4). `CU-001` is never reused.

No `sqlite_sequence` reset, no ID resequencing, and no Client Code compaction is permitted.

### Concurrency-safe creation

Creation must not read `MAX(id)` or `MAX(client_code)`.

Safe Worker pattern:

1. Insert Client with `client_code = NULL` and random `public_id`.
2. In the same D1 batch, update that inserted row using its generated `id`:
   `client_code = CU-(id-1)` with minimum-three-digit formatting.
3. Continue owned-contact/inquiry-conversion statements in the same batch where applicable.

This keeps manual Admin creation and Inquiry -> Client conversion on the same allocator and avoids browser-authoritative codes.

### Browser/API rule

- `POST /api/v1/admin/clients`: incoming `client_code` is ignored/rejected; server generates it.
- Client update endpoints never allow changing `client_code`.
- Admin UI shows code read-only after creation.
- New Client UI shows a message such as “Generated automatically after save”, not an editable code input.

---

## 4. Existing code normalization

Live `0004` allows historical/manual `client_code` values. NX-OPS-1.1 should normalize existing Clients once to the new deterministic format.

Proposed migration behavior:

```text
for every existing client:
client_code = CU-(id-1), minimum 3 digits
```

The operation is deterministic and unique because `id` is unique.

Before Live apply, record:

- total Clients
- `id, public_id, client_code` snapshot
- generated-code collision proof
- protected `project_inquiries/projects/services` counts

After apply, verify the same Client IDs/public IDs exist and only code normalization occurred.

---

## 5. Migration chain revision

`0005_client_projects.sql` was prepared previously but was never applied Live and is currently blocked.

The safe revised chain is:

```text
0001_schema.sql
0002_seed.sql
0003_inquiry_locale.sql
0004_clients_core.sql             [LIVE]
0005_clients_hardening.sql        [NEW, next]
0006_client_projects.sql          [renumber former draft 0005; later]
0007_project_work.sql             [later]
...
```

This is a formal roadmap renumbering, not a destructive database rewrite. Existing Live migrations `0001..0004` remain byte-identical.

### Proposed `0005_clients_hardening.sql`

Responsibilities only:

1. Create `client_profile_tokens`.
2. Add supporting indexes.
3. Normalize existing `client_code` values to `CU-(id-1)`.

It must not create Client Projects, Tasks, Tickets, Billing, Portal grants, or private files.

---

## 6. `client_profile_tokens` schema contract

Proposed table:

```text
client_profile_tokens
---------------------
id                    INTEGER PRIMARY KEY AUTOINCREMENT
public_id             TEXT NOT NULL UNIQUE
a client_id            INTEGER NOT NULL
token_hash            TEXT NOT NULL UNIQUE
expires_at            TEXT NOT NULL
completed_at          TEXT NULL
revoked_at            TEXT NULL
created_by_admin_id   INTEGER NOT NULL
created_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
```

(`a client_id` above means the column name is `client_id`; the leading `a` is not part of the schema.)

Foreign keys:

- `client_id -> clients.id ON DELETE RESTRICT`
- `created_by_admin_id -> admin_users.id ON DELETE RESTRICT`

Indexes:

- `(client_id, created_at DESC, id DESC)`
- `(expires_at, completed_at, revoked_at)`

Raw completion tokens are never stored in D1. Only SHA-256 hashes are persisted.

Recommended token: 32 random bytes (256-bit), base64url encoded.

Default expiry: 72 hours. Admin can revoke and regenerate. Maximum supported expiry for this phase: 7 days.

---

## 7. Secure Client Profile Completion contract

### Link design

Admin creates a one-purpose link such as:

```text
/client-profile.html#token=<opaque-token>
```

Use the URL fragment so the raw token is not sent in the initial HTTP request/referrer. Client-side JS reads it, stores it only for the active completion session, removes it from visible browser history, and sends it in POST JSON only to the completion API.

The page must use:

- same-origin assets only
- `Referrer-Policy: no-referrer`
- `robots: noindex,nofollow`
- no third-party analytics/scripts in this flow

### Public API

Proposed endpoints:

```text
POST /api/v1/client-profile/resolve
POST /api/v1/client-profile/complete
```

Both accept the raw token in JSON and perform constant-shape invalid/expired/revoked handling. Both are rate-limited.

### Client-safe DTO

May expose only:

- client type (read-only)
- display name
- legal name
- preferred language
- billing name
- billing email
- billing phone
- billing address line 1/2
- city
- region/state
- postal code
- country code
- tax identifier only when `company`
- primary contact name/email/phone/role title

Must not expose:

- internal numeric id
- random internal/public provenance IDs unless strictly necessary
- status/lifecycle controls
- source inquiry history
- audit logs
- admin identity
- internal notes
- portal flags/access
- future projects/tasks/tickets/billing data

### Completion write behavior

On successful final completion:

- validate allowlisted fields server-side
- enforce Company/Individual tax rule server-side
- update the same Client
- update existing active primary contact, or create one if none exists
- never alter `client_code`, status, archive state, provenance, portal access, or audit history
- set token `completed_at`
- token becomes unusable for further writes
- write audit event `client.profile_complete`

No public Client creation endpoint is introduced.

---

## 8. Admin profile-link API contract

Proposed Admin endpoints:

```text
POST /api/v1/admin/clients/:id/profile-completion-link
POST /api/v1/admin/clients/:id/profile-completion-link/revoke
```

Both retain existing Admin auth + same-origin + CSRF rules.

Generate endpoint:

- Client must exist and not be archived.
- Revoke any prior uncompleted active token for that Client.
- Generate new 256-bit token.
- Store only token hash.
- Return the raw completion URL once.
- Audit `client.profile_link.create`.

Revoke endpoint:

- revoke active uncompleted tokens for that Client
- audit `client.profile_link.revoke`

Admin detail response may expose only token status metadata (`expires_at`, `completed_at`, `revoked_at`), never `token_hash`.

Initial delivery UX is “Generate / Copy secure link”. Automatic email sending is outside this gate unless separately approved.

---

## 9. Individual / Company validation rules

### Admin create/update/conversion

Authoritative Worker rule:

```text
if client_type === "individual":
    tax_identifier = NULL
else if client_type === "company":
    tax_identifier = validated optional text
```

Browser manipulation cannot bypass it.

### UI

- `tax_identifier` wrapper is absent/hidden for Individual.
- It appears for Company.
- Switching Company -> Individual with a stored tax ID requires explicit themed confirmation before save and clearly states the value will be cleared.
- Draft preservation on AR/EN switch must retain the current type and currently entered Company tax value while the user is still editing, until the user confirms type conversion/save.

---

## 10. Admin lifecycle and guarded hard delete

### Deactivate / Reactivate

Keep database/API status key `on_hold` for compatibility, but UI may label it “Inactive / غير نشط”.

Dedicated UI actions are preferred over relying only on an editable status dropdown.

Audit actions:

```text
client.deactivate
client.reactivate
client.archive
client.restore
```

### Permanent Delete policy

Permanent Delete is an explicit Owner-approved exception to the earlier no-hard-delete Clients policy, but it is **guarded**, not a general unrestricted delete.

Delete is permitted only when there is no external/historical business relation that must survive.

Current blocker:

- any `inquiry_conversions` row -> hard delete BLOCKED

Owned profile records such as contacts and unused completion tokens may be removed in the same controlled delete batch after blockers pass.

Future blocker registry must be extended when later domains exist:

- client_projects
- tickets
- quotes
- invoices/payments
- portal grants/sessions
- other historical business relations

If any blocker exists:

```text
409 CLIENT_DELETE_BLOCKED
```

and UI directs Admin to Deactivate or Archive instead.

### Delete endpoint

Prefer an explicit CSRF-protected action endpoint rather than a generic HTTP DELETE route:

```text
POST /api/v1/admin/clients/:id/delete
```

Body requires exact current Client Code confirmation, for example:

```json
{
  "confirm_client_code": "CU-017"
}
```

Worker re-reads the current row and verifies the code before deletion.

On allowed deletion:

1. Snapshot safe audit context (`id`, `public_id`, `client_code`, display name, owned-contact count).
2. Delete/revoke ephemeral profile tokens.
3. Delete owned contacts.
4. Delete Client.
5. Insert durable audit event `client.delete` referencing the old ID/code snapshot.

No ID sequence reset and no code reuse.

---

## 11. UI / Dark-Light regression hardening

The accepted select hotfix remains baseline. Do not revert it.

All new Client controls must use the existing themed Admin control classes and no raw unstyled OS control should be introduced.

Required acceptance matrix for each affected screen:

```text
Arabic / RTL + Dark
Arabic / RTL + Light
English / LTR + Dark
English / LTR + Light
```

Viewport matrix:

```text
Desktop
Tablet
Mobile
```

State matrix:

```text
Default
Hover
Focus
Open dropdown
Selected option
Disabled
Read-only
Validation error
Confirmation dialog
Danger/delete action
```

Affected surfaces:

- Clients list filters
- Add Client
- Edit Client
- lifecycle actions
- Delete confirmation
- Generate/Copy completion link
- public profile-completion page
- Inquiry -> New Client conversion

No native `window.confirm()` / `alert()` is used for destructive UX because it cannot be themed consistently. Use an in-app AR/EN themed confirmation component.

---

## 12. Proposed API changes

Existing endpoints retained:

```text
GET  /api/v1/admin/clients/config
GET  /api/v1/admin/clients
POST /api/v1/admin/clients
GET  /api/v1/admin/clients/:id
POST /api/v1/admin/clients/:id/update
PATCH /api/v1/admin/clients/:id
POST /api/v1/admin/clients/:id/contacts
POST /api/v1/admin/clients/:id/contacts/:contactId/update
PATCH /api/v1/admin/clients/:id/contacts/:contactId
POST /api/v1/admin/inquiries/:id/convert-client
```

New endpoints:

```text
POST /api/v1/admin/clients/:id/deactivate
POST /api/v1/admin/clients/:id/reactivate
POST /api/v1/admin/clients/:id/archive
POST /api/v1/admin/clients/:id/restore
POST /api/v1/admin/clients/:id/delete
POST /api/v1/admin/clients/:id/profile-completion-link
POST /api/v1/admin/clients/:id/profile-completion-link/revoke
POST /api/v1/client-profile/resolve
POST /api/v1/client-profile/complete
```

No Portal endpoint is added.

---

## 13. Proposed source-file change set for implementation

Expected existing files to modify:

```text
src/api-router.js
src/modules/operations/clients.js
src/core/crypto.js                    (only if a random-byte helper is factored here)
public/admin/js/modules/clients.js
public/admin/js/modules/inquiries.js   (new-client conversion UX/code/tax behavior)
public/admin/js/core/i18n.js
public/admin/js/core/ui.js             (themed confirmation if shared)
public/admin/css/admin.css
```

Expected new files:

```text
migrations/0005_clients_hardening.sql
src/modules/operations/client-profile.js
public/client-profile.html
public/assets/js/client-profile.js      (exact asset path to follow current public convention)
public/assets/css/client-profile.css    (only if existing public CSS cannot safely host isolated styles)
tests/nx-ops-1-1/*
scripts/NX_OPS_1_1_CHECK.mjs
scripts/APPLY_NX_OPS_1_1_LIVE.ps1
docs/NX_OPS_1_1_CLIENTS_HARDENING.md
NX_OPS_1_1_FINAL_CHECK.md
```

The exact public asset filenames should be locked only after checking the existing public asset conventions during implementation.

---

## 14. Gate / test plan

### Migration gate

- inventory exactly `0001..0005`
- `0001..0004` hashes byte-identical
- `0005` review for only approved schema/backfill
- disposable full migration execution
- repeat-safe schema creation where applicable
- `PRAGMA foreign_key_check`
- existing protected counts preserved
- existing Clients keep same `id` and `public_id`
- generated code uniqueness and unbounded formatting proof, including ids mapping through 999/1000/1001 scenarios

### Client Code tests

- browser-supplied code cannot choose/overwrite code
- create first/normal client -> correct generated code
- Inquiry conversion -> same allocator
- deletion does not reuse code
- sequence is never reset
- `CU-999 -> CU-1000` proof
- concurrent/new-client simulation does not duplicate code

### Tax rule tests

- Individual + browser-supplied tax -> stored NULL
- Company tax -> stored
- Company -> Individual requires UI confirmation and clears on accepted save
- profile-completion DTO omits tax for Individual

### Lifecycle/delete tests

- deactivate/reactivate
- archive/restore
- delete clean client PASS
- delete client with inquiry conversion BLOCKED
- delete wrong confirmation code BLOCKED
- contacts/tokens cleaned only for allowed delete
- audit rows written
- next client ID/code continues after deletion

### Profile completion security

- no public Client creation
- token hash only at rest
- invalid/expired/revoked/completed token rejected
- one Client only
- field allowlist enforced
- status/code/internal/provenance/portal writes rejected/ignored
- same Client updated
- primary contact upsert behavior
- rate limit
- audit

### Regression

- public Worker parity
- existing Admin compatibility with explicitly updated route inventory
- Phase 6.2 Inquiry Live Sync
- Inquiry conversion idempotency and no automatic status change
- AR/EN
- Dark/Light
- Desktop/Tablet/Mobile
- no Client Projects/Tasks/Tickets/Billing/Portal exposure

---

## 15. Revised implementation sequence

Based on the actual source inspection, the safest sequence is slightly reordered from the initial proposal:

```text
NX-OPS-1 current Live baseline
        |
        v
NX-DATA-1.1 / 0005_clients_hardening.sql
  - token schema
  - deterministic existing-code normalization
        |
        v
NX-OPS-1.1A
  - server-generated code
  - company/individual tax rule
  - lifecycle actions
  - guarded hard delete
  - Admin UX / theme regression
        |
        v
NX-OPS-1.1B
  - secure profile-completion link
  - public client-safe completion page/API
        |
        v
NX-OPS-1.1 Real Browser + Security + Live Gate
        |
        v
CLIENTS DOMAIN CLOSED
        |
        v
NX-DATA-2 (renumbered migration: 0006_client_projects.sql)
        |
        v
NX-OPS-2 Project Workspace
```

Reason for the reorder: the code-hardening phase needs a deterministic one-time normalization contract for already-existing Clients, and the secure completion flow needs its token table before runtime exposure. This keeps every runtime phase backed by an already-approved data contract.

---

## 16. Read-only gate decision

**DESIGN REVIEW: PASS / READY FOR OWNER APPROVAL TO IMPLEMENT NX-DATA-1.1.**

No source/runtime/migration/live data was modified as part of this design review.

The next implementation action, only after Owner approval, is:

```text
NX-DATA-1.1 — create 0005_clients_hardening.sql + deterministic disposable DB proof only.
```

Do not implement Client Projects or restore the old draft `0005_client_projects.sql` at this point.
