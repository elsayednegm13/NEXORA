# NEXORA NX-DATA-2 — Client Projects Final Check

## Gate status

**LOCAL ENGINEERING GATE: PASS**  
**REMOTE CLOUDFLARE D1 APPLY: PENDING OWNER/LIVE EXECUTION**

NX-DATA-2 is schema-only. No Client Projects runtime/API/Admin UI has been exposed.

## Baseline preservation

Protected accepted baseline:

```text
159 / 159 pre-existing files byte-identical
38 / 38 public non-Admin files byte-identical
```

Accepted migrations `0001..0006` remain byte-identical.

## Added migration

```text
migrations/0007_client_projects.sql
```

Creates exactly:

```text
client_projects
client_project_services
client_project_members
inquiry_project_links
```

No Tasks, Milestones, Events, Portal, Tickets, Quotes, Invoices, Payments, or private-file tables are introduced.

## Architecture isolation

```text
projects         = public Portfolio CMS — unchanged
client_projects  = internal Client Operations — new schema only
```

`0007` does not alter, update, or reference the public Portfolio `projects` table.

## Migration safety

`0007` contains no destructive/data mutation statement:

```text
DROP / TRUNCATE / ALTER existing / DELETE / UPDATE / INSERT / seed = NONE
```

It is repeat-apply safe in disposable SQLite/D1-compatible proof.

## Relational proof

PASS:

- full migration chain `0001..0007`;
- repeat-apply of `0007`;
- exact columns/indexes/FKs;
- `PRAGMA foreign_key_check`;
- Phase 6.2 seed preservation: Services 5 / Portfolio Projects 12 / Inquiry options 16;
- all four new tables start empty;
- unique `public_id` and optional `project_code`;
- Inquiry -> multiple internal Client Projects provenance;
- duplicate Inquiry/Project pair rejection;
- manual progress 0..100 invariant;
- non-negative `agreed_amount_minor` invariant;
- `portal_visible` boolean invariant;
- evolving status/priority/progress-mode values are not frozen by DB CHECK constraints;
- restrictive history/operations FKs;
- `updated_by_admin_id` uses `ON DELETE SET NULL`;
- existing guarded Client delete dynamically recognizes new Client Project relations.

## Runtime/UX regression

```text
Public/unauthenticated Worker parity       21/21 PASS
Existing authenticated Admin compatibility 10/10 PASS
NX-OPS-1.1A Clients integration/UI                PASS
NX-OPS-1.1B Profile Completion integration/UI     PASS
Primary CTA white-text UX                         PASS
HTML/CSS/JS structural checks                     PASS
```

No NX-OPS-2 route, screen, or navigation placeholder is present.

## Remote gate

Run preflight only first:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\APPLY_NX_DATA_2.ps1
```

Only after review:

```powershell
.\scripts\APPLY_NX_DATA_2.ps1 -ApplyRemote
```

The remote script is locked to the existing `nexoratechnologies` Worker and existing `DB -> nexora-db` D1 UUID. It does not deploy runtime code or reset Secrets.

## Decision

**NX-DATA-2 local engineering gate: PASS.**

Next authorized implementation gate after live D1 acceptance:

```text
NX-OPS-2 — Project Workspace
```
