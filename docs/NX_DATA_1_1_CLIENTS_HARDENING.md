# NEXORA — NX-DATA-1.1 Clients Hardening

## Scope

Schema/data gate only. Baseline: accepted NX-OPS-1 Live + select Dark/Light visual hotfix.

Adds exactly one new table:

```text
client_profile_tokens
```

and performs one intentional deterministic normalization of existing `clients.client_code` values.

No Worker/API/Admin/Public runtime file is changed by this gate.

## Client Code normalization

Authoritative mapping approved for NX-OPS-1.1 runtime:

```text
client_number = clients.id - 1
client_code   = CU- + client_number with minimum 3 digits
```

Examples:

```text
id=1     -> CU-000
id=2     -> CU-001
id=1000  -> CU-999
id=1001  -> CU-1000
```

The migration clears existing codes to `NULL` first, then assigns deterministic values. The two-phase operation prevents temporary UNIQUE collisions when historical/manual codes are swapped.

The migration does not reset `sqlite_sequence`, resequence IDs, or reuse deleted IDs. `INTEGER PRIMARY KEY AUTOINCREMENT` remains the Client identity source.

## Secure profile-completion token storage

`client_profile_tokens` stores only hashed tokens and lifecycle metadata:

```text
id
public_id
client_id
token_hash
expires_at
completed_at
revoked_at
created_by_admin_id
created_at
```

Foreign keys are restrictive to protect provenance. Raw completion tokens are never stored in D1.

No public profile-completion endpoint is exposed in this data-only gate. That runtime belongs to NX-OPS-1.1B.

## Explicitly not included

- automatic Client Code generation in Worker runtime (NX-OPS-1.1A)
- Individual/Company Tax UI/runtime rules (NX-OPS-1.1A)
- deactivate/archive/delete Admin controls (NX-OPS-1.1A)
- profile-link generation/resolve/complete APIs (NX-OPS-1.1B)
- Client Portal
- Client Projects
- Tasks/Milestones
- Tickets/SLA
- Quotes/Invoices/Payments
- R2/private files

The old draft `0005_client_projects.sql` is superseded and must never be applied with that number. Client Projects will be renumbered to `0006_client_projects.sql` only after Clients hardening closes.

## Deterministic local proof

Run:

```powershell
node .\scripts\NX_DATA_1_1_CHECK.mjs
```

The gate proves:

- all 121 accepted baseline files remain byte-identical;
- all 35 public non-Admin files remain byte-identical;
- migration inventory is exactly `0001..0005`;
- migrations `0001..0004` retain accepted hashes;
- `0005` introduces only `client_profile_tokens` plus the approved Client Code normalization;
- swapped legacy codes normalize without UNIQUE collision;
- `CU-999 -> CU-1000` formatting has no artificial cap;
- Client IDs/public IDs are preserved by normalization;
- AUTOINCREMENT does not reuse/resequence a deleted committed Client ID;
- token hash uniqueness and restrictive FKs work;
- Phase 6.2 public seed remains intact;
- public/unauthenticated parity stays 21/21;
- existing authenticated Admin compatibility stays 10/10;
- NX-OPS-1 Clients + Inquiry conversion integration remains PASS.

## Remote gate

Validation/preflight only:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\APPLY_NX_DATA_1_1.ps1
```

The preflight is read-only and records remote migration state, protected production counts, current Client identity/code values, and generated-code uniqueness.

Only after explicit owner approval:

```powershell
.\scripts\APPLY_NX_DATA_1_1.ps1 -ApplyRemote
```

The script targets only the verified existing binding:

```text
DB -> nexora-db
UUID 71c3bf88-b71d-465b-9032-5251a11fde64
```

It never creates/replaces D1, resets Secrets, or deploys Worker/Admin assets.

## Next gate

After NX-DATA-1.1 local + live acceptance:

```text
NX-OPS-1.1A — Automatic Client Code + Type/Tax + Admin lifecycle/delete
```
