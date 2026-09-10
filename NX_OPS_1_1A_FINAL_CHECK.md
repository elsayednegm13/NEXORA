# NEXORA NX-OPS-1.1A R1 — Clients Runtime / UX Hardening Final Check

## Decision

**LOCAL ENGINEERING GATE: PASS**  
**REMOTE RUNTIME DEPLOY: BLOCKED UNTIL NX-DATA-1.2 / 0006 LIVE ACCEPTANCE**

## Correct Client Code contract

```text
Client Code = CU-{clients.id}, minimum width 3
id=1     -> CU-001
id=2     -> CU-002
id=999   -> CU-999
id=1000  -> CU-1000
```

No `CU-000` is generated. No artificial upper bound exists. Browser input is non-authoritative/read-only. New Inquiry conversion uses the same server allocator.

## Existing NX-OPS-1.1A behavior retained

- Individual -> `tax_identifier=NULL` server-side and hidden in UI.
- Company -> tax identifier available.
- Company -> Individual uses NEXORA-themed confirmation.
- active / on_hold / archived lifecycle with explicit transitions.
- guarded permanent delete requires exact Client Code and rejects historical/operational blockers.
- clean dependent contacts/profile tokens can be removed only as part of an eligible guarded delete.
- no sequence reset and no ID/Code reuse.
- Dark/Light, AR/EN, desktop/tablet/mobile form controls remain in the accepted surface.
- no Client Portal, Client Projects, Tasks, Tickets, Billing, or future placeholder route is exposed.

## Local proof

```text
Protected prior baseline outside approved surface       PASS
Public website 35 files byte-identical                  PASS
Migration inventory 0001..0006                          PASS
Applied migrations 0001..0005 byte-identical            PASS
0006 forward-only correction present                    PASS
API inventory exact 37                                  PASS
Public Worker parity 21/21                              PASS
Existing Admin compatibility 10/10                      PASS
NX-DATA-1.2 schema proof                                PASS
NX-OPS-1.1A UI contract                                 PASS
NX-OPS-1.1A integration                                 PASS
```

Integration evidence includes:

```text
company_id=1        company_code=CU-001
deleted_id=2        deleted_code=CU-002
post_delete_id=3    post_delete_code=CU-003
boundary id=999     CU-999
boundary id=1000    CU-1000
converted id=1001   CU-1001
```

## Gate order

1. Apply/accept NX-DATA-1.2 `0006_clients_code_alignment.sql` live.
2. Run `APPLY_NX_OPS_1_1A.ps1` preflight.
3. Deploy NX-OPS-1.1A R1 only when the remote migration chain has no pending migration.
4. Complete real-browser Dark/Light + AR/EN + lifecycle/delete/tax/code acceptance.
5. Only then continue to NX-OPS-1.1B Secure Client Profile Completion.
