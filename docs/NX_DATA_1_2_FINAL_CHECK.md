# NEXORA NX-DATA-1.2 — Final Engineering Check

## Decision

**LOCAL ENGINEERING GATE: PASS**  
**REMOTE D1 APPLY: PENDING OWNER/LIVE EXECUTION**

## Locked correction

```text
id=1     -> CU-001
id=999   -> CU-999
id=1000  -> CU-1000
```

`0005_clients_hardening.sql` remains byte-identical and immutable. `0006_clients_code_alignment.sql` is the forward-only correction.

## Deterministic proof

```text
Migration inventory 0001..0006                         PASS
Applied migration hashes 0001..0005                    PASS
0006 exact two-phase clients.client_code mutation       PASS
0006 contains no DROP/TRUNCATE/DELETE/INSERT/ALTER      PASS
Fresh chain 0001..0006                                  PASS
Historical 0005 id-1 state observed                     PASS
0006 CU-{id} correction                                 PASS
CU-001 / CU-999 / CU-1000 formatting                    PASS
Client id/public_id preservation                        PASS
AUTOINCREMENT no-reuse after hard delete                PASS
client_profile_tokens retained                          PASS
PRAGMA foreign_key_check                                PASS
Public seed preservation                                PASS
Future-module isolation                                 PASS
```

## Runtime proof

Corrected NX-OPS-1.1A runtime and tests are aligned to `CU-{id}`. Public/unauthenticated parity remains 21/21, existing authenticated Admin compatibility remains 10/10, and the full Clients hardening integration passes.

## Remote rule

Run preflight first:

```powershell
.\scripts\APPLY_NX_DATA_1_2.ps1
```

Only after reviewing that output:

```powershell
.\scripts\APPLY_NX_DATA_1_2.ps1 -ApplyRemote
```

This script never creates/replaces D1, resets Secrets, or deploys Worker/Admin assets.
