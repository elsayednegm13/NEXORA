# NEXORA NX-DATA-2 — Client Projects Data Foundation

## Decision

NX-DATA-2 introduces the **internal Client Projects data domain** only. It does not expose any Client Projects API or Admin screen yet.

The accepted public Portfolio domain remains unchanged:

```text
projects                = public Website / Portfolio CMS
client_projects         = internal client delivery / operations
```

These domains must not be merged or reused for each other.

## Baseline

Accepted baseline before NX-DATA-2:

```text
Phase 6.2
+ NX-CORE-2
+ NX-DATA-1
+ NX-OPS-1
+ NX-DATA-1.1
+ NX-DATA-1.2
+ NX-OPS-1.1A
+ NX-OPS-1.1B
+ accepted Primary CTA / Notification UX standards
```

Migrations `0001..0006` are immutable. NX-DATA-2 adds only:

```text
migrations/0007_client_projects.sql
```

## Tables introduced

### `client_projects`

Internal project identity and lifecycle foundation:

```text
id                          INTEGER AUTOINCREMENT
public_id                   TEXT UNIQUE NOT NULL
project_code                TEXT UNIQUE NULLABLE
client_id                   FK -> clients
name                        TEXT NOT NULL
description                 TEXT
status                      default planning
priority                    default normal
progress_mode               default manual
manual_progress_percent     nullable 0..100
start_date                  nullable YYYY-MM-DD contract at runtime
target_date                 nullable YYYY-MM-DD contract at runtime
completed_at                nullable UTC timestamp contract at runtime
agreed_amount_minor         nullable integer minor-unit context
currency                    nullable
portal_visible              0/1 default 0
created_by_admin_id         FK -> admin_users RESTRICT
updated_by_admin_id         FK -> admin_users SET NULL
created_at / updated_at
archived_at
```

`status`, `priority`, and `progress_mode` are deliberately **not** frozen in evolving DB CHECK constraints. NX-OPS-2 service logic owns their accepted catalogs and transitions.

`project_code` is nullable in this data gate. NX-DATA-2 does not invent an authoritative numbering format. If NX-OPS-2 introduces a project-code allocator, that allocator must be server-authoritative and tested separately.

`public_id` is required and unique, but its random/non-sequential generation belongs to NX-OPS-2 runtime.

`agreed_amount_minor` is optional project context only. It is not quote/invoice/payment authority. Billing remains a later domain.

`portal_visible=0` is metadata only and grants no Client Portal access.

### `client_project_services`

Classifies an internal Client Project against the existing Services catalog:

```text
(client_project_id, service_id) PRIMARY KEY
sort_order
scope_note
```

Both FKs use `ON DELETE RESTRICT` to preserve operational history.

### `client_project_members`

Stores Admin participation on a Client Project:

```text
(client_project_id, admin_user_id) PRIMARY KEY
role_key
is_lead 0/1
joined_at
```

This is not RBAC. It is project participation metadata. Any one-lead rule belongs to NX-OPS-2 service logic rather than a global authorization redesign.

### `inquiry_project_links`

Preserves Inquiry -> internal Project provenance without rewriting the Inquiry:

```text
(project_inquiry_id, client_project_id) PRIMARY KEY
linked_by_admin_id
linked_at
```

One Inquiry may legitimately result in more than one internal Client Project. The same Inquiry/Project pair cannot be duplicated.

## Delete / archive boundary

NX-DATA-2 adds no delete API.

Client Project relations use restrictive FKs so accidental hard deletion cannot silently erase operational/provenance history. Normal project lifecycle removal under NX-OPS-2 will use archive/state transitions.

The existing guarded Client permanent-delete implementation dynamically discovers foreign keys referencing `clients`. Once a Client has a `client_projects` row, that relation becomes a protected delete blocker automatically.

## Migration safety

`0007_client_projects.sql` is additive-only:

```text
DROP                  NONE
TRUNCATE              NONE
ALTER existing        NONE
DELETE                NONE
UPDATE/backfill       NONE
INSERT/seed           NONE
```

It creates exactly four tables plus their indexes using `IF NOT EXISTS`.

It does not create:

```text
project_milestones
project_tasks
client_project_notes
operation_events
Portal access/session tables
Tickets/SLA
Quotes
Invoices
Payments
Private file/R2 tables
```

## Local deterministic gate

Run:

```powershell
node .\scripts\NX_DATA_2_CHECK.mjs
```

The gate proves:

- all accepted pre-existing baseline files remain byte-identical;
- public website + Client Profile assets remain byte-identical;
- migration inventory is exactly `0001..0007`;
- migrations `0001..0006` retain accepted hashes;
- `0007` is additive-only and touches no Portfolio `projects` schema;
- no NX-OPS-2 route/navigation/UI is exposed early;
- exact new table columns, indexes and FKs exist;
- repeat-apply is safe in disposable SQLite/D1-compatible validation;
- `PRAGMA foreign_key_check` passes;
- Phase 6.2 seed remains unchanged;
- all four Client Project tables start empty;
- public ID and optional project-code uniqueness work;
- one Inquiry can link to multiple Client Projects;
- invalid progress, negative agreed amount and invalid boolean storage are rejected;
- workflow catalogs remain Worker/service-authoritative;
- relational hard-delete protection works;
- public Worker parity remains `21/21`;
- existing authenticated Admin compatibility remains `10/10`;
- NX-OPS-1.1A and NX-OPS-1.1B regressions remain PASS;
- accepted Primary CTA white-text UX remains intact.

## Remote gate

Validation only:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\APPLY_NX_DATA_2.ps1
```

After owner approval:

```powershell
.\scripts\APPLY_NX_DATA_2.ps1 -ApplyRemote
```

The script targets only the existing canonical resources:

```text
Worker: nexoratechnologies
D1 binding: DB
Database: nexora-db
UUID: 71c3bf88-b71d-465b-9032-5251a11fde64
```

It never creates/replaces D1, resets Secrets, or deploys Worker/Admin/Public code.

Before apply it verifies Cloudflare identity, exact D1 identity, migration state, and protected production counts. The only acceptable pending migration is `0007_client_projects.sql`.

After apply it verifies:

- no migrations remain pending;
- exactly the four Client Projects tables exist;
- all four new tables contain zero rows before NX-OPS-2;
- `PRAGMA foreign_key_check` returns no violations;
- protected production counts are unchanged;
- existing public runtime checks still pass.

## Next gate

Only after NX-DATA-2 local + live D1 acceptance:

```text
NX-OPS-2 — Project Workspace
```

NX-OPS-2 may expose the internal Client Projects API/Admin UX. Tasks, Milestones, Events, Tickets, Billing and Portal remain blocked behind later data gates.
