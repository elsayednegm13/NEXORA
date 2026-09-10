# NEXORA NX-DATA-1.1 — Clients Hardening Final Check

## Gate status

**LOCAL ENGINEERING GATE: PASS**  
**REMOTE CLOUDFLARE D1 APPLY: NOT PERFORMED**

NX-DATA-1.1 is ready as a local/data-gate artifact only. No claim is made that `0005_clients_hardening.sql` is applied to the live D1 database.

## Accepted baseline

Source baseline:

```text
NX-OPS-1 Live deployed
+ canonical Cloudflare DB binding reconciliation
+ accepted Dark/Light native-select visual hotfix
```

Protected baseline manifest:

```text
scripts/NX_DATA_1_1_PROTECTED_BASELINE_SHA256.json
```

Result:

```text
121 / 121 pre-existing files byte-identical
35 / 35 public non-Admin files byte-identical
```

No existing runtime/UI/API/migration file from the accepted baseline was edited.

## Added scope

```text
migrations/0005_clients_hardening.sql
scripts/NX_DATA_1_1_CHECK.mjs
scripts/NX_DATA_1_1_PROTECTED_BASELINE_SHA256.json
scripts/APPLY_NX_DATA_1_1.ps1
tests/nx-data-1-1/schema-proof.py
docs/NX_DATA_1_1_CLIENTS_HARDENING.md
docs/NX_OPS_1_1_DESIGN_REVIEW.md
NX_DATA_1_1_FINAL_CHECK.md
```

## Migration contract

`0005_clients_hardening.sql` does exactly two things:

1. creates `client_profile_tokens` with token hash uniqueness, expiry/completion/revocation metadata, restrictive Client/Admin provenance FKs and indexes;
2. performs the owner-approved deterministic one-time normalization of `clients.client_code`:

```text
client_code = CU-(id - 1), minimum width 3
```

Examples:

```text
id=1     -> CU-000
id=2     -> CU-001
id=1000  -> CU-999
id=1001  -> CU-1000
```

The migration first sets current Client Codes to `NULL`, then assigns the deterministic value. This is deliberately collision-safe for historical/swapped manual codes under the existing SQLite UNIQUE-null semantics.

It does **not** reset `sqlite_sequence`, resequence Client IDs, or compact/reuse deleted IDs/codes.

## Migration isolation

Migration inventory is exactly:

```text
0001_schema.sql
0002_seed.sql
0003_inquiry_locale.sql
0004_clients_core.sql
0005_clients_hardening.sql
```

Accepted migrations `0001..0004` retain their exact hashes.

`0005` does not create or mutate:

- public Portfolio `projects`;
- Services;
- Inquiries;
- client contacts/conversions;
- Client Projects;
- Tasks/Milestones;
- Tickets/SLA;
- Quotes/Invoices/Payments;
- Portal grants;
- private file/R2 domains.

The previously prepared draft `0005_client_projects.sql` is superseded and must not be applied. Client Projects will be renumbered to `0006_client_projects.sql` later.

## D1-compatible proof

Disposable SQLite proof: **PASS**.

Verified:

```text
Migration inventory 0001..0005                   PASS
Prior 0001..0004 execution                       PASS
Legacy/swapped Client Code normalization         PASS
CU-999 -> CU-1000 unbounded formatting           PASS
Client id/public_id preservation                  PASS
AUTOINCREMENT no-reuse after committed delete    PASS
client_profile_tokens schema/index/FK/uniqueness PASS
Future module isolation                          PASS
PRAGMA foreign_key_check                         PASS
Phase 6.2 public seed preservation                PASS
```

## Runtime regression proof

Because NX-DATA-1.1 changes no runtime byte:

```text
Public / unauthenticated Worker parity       21 / 21 PASS
Existing authenticated Admin compatibility  10 / 10 PASS
NX-OPS-1 Clients + Inquiry conversion                   PASS
```

The existing integration model still reports:

```json
{
  "clients": 57,
  "contacts": 3,
  "conversions": 2,
  "audit_actions": 7
}
```

## Remote gate

Preflight only:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\APPLY_NX_DATA_1_1.ps1
```

This validates the local gate, exact existing D1 identity, Cloudflare identity, remote migration state, protected production counts, current `id/public_id/client_code` snapshot, and generated-code uniqueness. It performs no remote migration when `-ApplyRemote` is absent.

Only after owner review/approval:

```powershell
.\scripts\APPLY_NX_DATA_1_1.ps1 -ApplyRemote
```

Target is locked to the existing production database:

```text
binding: DB
database: nexora-db
UUID: 71c3bf88-b71d-465b-9032-5251a11fde64
```

The script never creates/replaces D1, resets Worker Secrets, or deploys Worker/Admin/Public assets.

## Decision / next gate

**NX-DATA-1.1 LOCAL ENGINEERING GATE: PASS.**

Remote D1 acceptance is still required before runtime implementation begins.

Next gate after NX-DATA-1.1 live acceptance:

```text
NX-OPS-1.1A
Automatic Client Code + Individual/Company Tax rules + Admin lifecycle/guarded delete
```

Secure Client Profile Completion runtime remains NX-OPS-1.1B after that.
