# NEXORA NX-OPS-1.1B — Final Engineering Check

## Gate status

**LOCAL ENGINEERING GATE: PASS**  
**REMOTE WORKER DEPLOYMENT: PENDING**  
**REAL-BROWSER ACCEPTANCE: PENDING**

## Baseline

Accepted baseline before this change:

```text
Phase 6.2
+ NX-CORE-2
+ NX-DATA-1
+ NX-OPS-1
+ NX-DATA-1.1
+ NX-DATA-1.2
+ NX-OPS-1.1A
```

Migration inventory remains exactly:

```text
0001_schema.sql
0002_seed.sql
0003_inquiry_locale.sql
0004_clients_core.sql
0005_clients_hardening.sql
0006_clients_code_alignment.sql
```

No migration is added or modified by NX-OPS-1.1B.

## Approved runtime/UI additions

```text
src/modules/operations/client-profile.js
public/client-profile.html
public/css/client-profile.css
public/js/client-profile.js
```

Approved existing-file changes are limited to:

```text
src/api-router.js
src/modules/operations/clients.js
public/admin/js/modules/clients.js
public/admin/js/core/ui.js
public/admin/js/core/i18n.js
public/admin/css/admin.css
```

All other pre-existing files are protected by:

```text
scripts/NX_OPS_1_1B_PROTECTED_BASELINE_SHA256.json
```

Result:

```text
137 protected pre-existing files byte-identical outside approved surface
35 existing public-site files byte-identical
```

## Deterministic verification

```text
Migration inventory / hashes                         PASS
Exact API inventory (42 incl. OPTIONS)               PASS
No generic HTTP DELETE                               PASS
No early Portal/Projects/Tasks/Tickets/Billing       PASS
Hash-only 256-bit profile capability                 PASS
Raw token excluded from audit/status storage         PASS
Regeneration rotates/revokes prior link              PASS
One-time completion / replay rejection               PASS
Expiry / revoke enforcement                          PASS
Deactivate/archive capability revocation             PASS
Public DTO deny-by-default                           PASS
Server-owned Client Code / Type / Status              PASS
Company/Individual Tax rule                          PASS
Admin auth + CSRF + same-origin negatives            PASS
Public same-origin + rate-limit contract              PASS
Admin/public AR/EN + Dark/Light UX contract           PASS
Notification placement/semantic styling              PASS
Technical sequencing notes removed from rendered UX  PASS
HTML duplicate IDs                                   PASS
CSS structure                                        PASS
Runtime JavaScript syntax                            PASS
NX-DATA-1.2 regression                               PASS
Public Worker parity                                 21/21 PASS
Existing authenticated Admin compatibility           10/10 PASS
NX-OPS-1.1A integration regression                   PASS
NX-OPS-1.1A UI regression                            PASS
NX-OPS-1.1B integration                              PASS
```

Focused integration evidence:

```text
company id/code      1 / CU-001
individual id/code   2 / CU-002
profile tokens       6 disposable test capabilities
profile audit        generate + revoke + complete present
foreign_key_check    PASS
```

All integration data is disposable test data and is not written to the owner's live D1.

## Decision

NX-OPS-1.1B is ready for **read-only live preflight**.

Run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\APPLY_NX_OPS_1_1B.ps1
```

Do not use `-DeployRemote` until the preflight output is reviewed.
