# NEXORA NX-DATA-1 — Clients Core Final Check

## Gate status

**ENGINEERING GATE: PASS**  
**REMOTE CLOUDFLARE D1 APPLY: PENDING OWNER/LIVE EXECUTION**

NX-DATA-1 is a schema-only stage. No new Clients UI/API or business workflow has been exposed.

## Baseline

Source baseline:

```text
Phase 6.2 Inquiry UX + Live Sync
+ NX-CORE-2 Modular Foundation
```

Protected baseline manifest:

```text
scripts/NX_DATA_1_PROTECTED_BASELINE_SHA256.json
```

Result:

```text
102 / 102 pre-existing files byte-identical
```

No existing source/public/admin/migration file was edited.

## Added migration

```text
migrations/0004_clients_core.sql
```

Creates:

```text
clients
client_contacts
inquiry_conversions
```

Does not create:

```text
client_projects
tasks
milestones
tickets
portal grants
quotes
invoices
payments
```

## Destructive-change gate

`0004` is additive-only.

- DROP: NONE
- TRUNCATE: NONE
- ALTER existing tables: NONE
- DELETE: NONE
- UPDATE/backfill: NONE
- INSERT/seed: NONE

Existing D1 data is not mutated by this migration.

## D1-compatible schema proof

Disposable SQLite/D1-compatible execution:

```text
0001_schema.sql             PASS
0002_seed.sql               PASS
0003_inquiry_locale.sql     PASS
0004_clients_core.sql       PASS
0004 repeat apply           PASS
foreign_key_check           PASS
```

Existing seed after `0004`:

```text
services                  5
projects                 12
inquiry_option_items     16
admin_users               0
clients                   0
client_contacts           0
inquiry_conversions       0
```

Relational proof:

- temporary Client creation: PASS
- temporary Contact relation: PASS
- temporary Inquiry conversion relation: PASS
- duplicate conversion rejected: PASS
- referenced Client hard delete rejected: PASS
- disposable proof transaction rolled back: PASS

## Runtime preservation proof

All runtime JavaScript syntax: PASS.

NX-CORE-2 deterministic Worker parity after adding the migration:

```text
Public/API parity            21/21 PASS
Authenticated Admin parity   10/10 PASS
```

Because runtime files are byte-identical, NX-DATA-1 does not expose new routes or screens.

## Architecture invariants retained

- `projects` remains Portfolio-only.
- Clients are a separate business domain.
- Inquiry history is preserved rather than repurposed as Client storage.
- One Inquiry conversion is idempotently unique.
- No hard-delete workflow is introduced.
- State/catalog enums remain Worker-authoritative rather than frozen in evolving D1 CHECK constraints.
- No financial REAL/float fields are introduced.
- No fake portal, ticket, billing, or project-management screen is added early.

## Added engineering/support files

```text
migrations/0004_clients_core.sql
scripts/NX_DATA_1_CHECK.mjs
scripts/NX_DATA_1_PROTECTED_BASELINE_SHA256.json
scripts/APPLY_NX_DATA_1.ps1
tests/nx-data-1/schema-proof.py
docs/NX_DATA_1_CLIENTS_CORE.md
NX_DATA_1_FINAL_CHECK.md
```

## Live gate

No claim is made that `0004` has already been applied to the owner's Cloudflare D1 database.

The live apply must run against the existing bound database only:

```powershell
.\scripts\APPLY_NX_DATA_1.ps1 -ApplyRemote
```

The script checks Cloudflare identity, lists migration state, applies pending migrations, verifies migration state again, and runs the existing runtime check. It refuses to provision a new database when the expected binding is missing.

## Next step after live acceptance

```text
NX-OPS-1 — Clients API/UI + Inquiry → Client conversion
```

Do not start `0005_client_projects.sql` before the Clients domain API/UI and conversion workflow have passed their own gate.
