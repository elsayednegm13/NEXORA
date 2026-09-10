# NEXORA — NX-DATA-1 Clients Core

## Status

**Engineering implementation complete; remote D1 apply pending owner/live gate.**

This phase is intentionally database-only. It is built on the approved Phase 6.2 + NX-CORE-2 modular baseline and introduces the minimum persistent client domain required before any Clients UI/API or Inquiry → Client conversion behavior is allowed to exist.

## Scope

Added one forward-only D1 migration:

```text
migrations/0004_clients_core.sql
```

It creates exactly three operational tables:

```text
clients
client_contacts
inquiry_conversions
```

No Worker route, Admin route, public page, Admin screen, CSS, Phase 6.2 Inquiry behavior, authentication behavior, or existing API contract is changed in NX-DATA-1.

## Locked domain boundary

```text
projects              = public Portfolio / Website CMS
clients               = commercial customer/account
client_contacts       = people/stakeholders under a client
inquiry_conversions   = immutable provenance bridge from a Phase 6.2 inquiry to a client
```

`client_projects` is deliberately **not** created in this phase. It belongs to the next data gate (`0005_client_projects.sql`) after Clients API/UI is accepted.

## `clients`

The client record represents the commercial account, not a portal login and not a portfolio project.

Key properties:

- random/non-sequential `public_id` (generated later by the Worker service layer),
- optional human-readable `client_code`, independent of the integer primary key,
- individual/company type,
- current display/legal/billing identity,
- default currency and preferred language,
- lifecycle status with archive semantics,
- optional admin creator reference,
- timestamps and `archived_at`.

No status/client-type/language enum is frozen into a D1 `CHECK` constraint. Those evolving state/catalog rules remain server-authoritative in the Worker service layer.

## `client_contacts`

A client can have multiple contacts so the system never needs to duplicate a company record just because it has several stakeholders.

Database fields include:

- independent random `public_id`,
- `client_id`,
- name,
- optional email/phone,
- optional role title,
- preferred language,
- `is_primary`,
- `portal_enabled`,
- lifecycle status and timestamps.

Email and phone are individually nullable at the storage layer so future workflows can support email, phone/WhatsApp, or internal stakeholder records without a schema rewrite. NX-OPS-1 service validation must decide which contact channel is required for each action. Portal access itself will later require an explicit portal grant and must never be inferred from this table alone.

The “at most one primary contact per client” rule is intentionally owned by server service logic, matching the Master Architecture; it is not frozen as a database uniqueness rule.

## `inquiry_conversions`

This table is the idempotent provenance bridge between the existing Phase 6.2 lead workflow and Operations.

```text
project_inquiries
       │ UNIQUE
       ▼
inquiry_conversions
       │
       ▼
clients
```

Properties:

- `project_inquiry_id` is UNIQUE so the same inquiry cannot accidentally be converted twice,
- original Inquiry rows are not rewritten or deleted,
- the resulting client may be an existing client or a newly created client when NX-OPS-1 is implemented,
- conversion actor and timestamp are retained,
- `context_json` is reserved for non-authoritative conversion context/audit metadata.

## Delete policy

NX-DATA-1 does not introduce runtime delete APIs.

Foreign keys use restrictive behavior for client/contact/conversion provenance so a future accidental hard delete cannot silently erase commercial history. Client archival remains the normal removal path.

The creator reference on `clients.created_by_admin_id` uses `ON DELETE SET NULL` because the client itself must remain usable if an obsolete admin identity is ever removed by a future administrative maintenance process.

## Money and billing boundary

This migration does **not** add prices, quote totals, invoice totals, or payment fields.

The Master Architecture rule remains locked:

- financial amounts are integer minor units,
- financial totals are Worker-authoritative,
- quotes/invoices snapshot historical identity and pricing when sent/issued.

Current client billing fields are only current address/contact defaults for future document snapshots.

## No sequence table yet

`document_sequences` is not created in `0004` because this phase does not allocate invoice/quote/document numbers or require a sequential client code. `client_code` remains optional. A sequence table must only be introduced when an actual authoritative allocator is implemented.

## Safety characteristics

`0004_clients_core.sql` contains only additive `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements.

It contains no:

```text
DROP
TRUNCATE
ALTER
DELETE
UPDATE
INSERT / backfill
```

It does not modify existing records.

## Verification

Engineering proof performed in a disposable SQLite/D1-compatible database:

- migrations `0001 → 0004`: PASS,
- repeat-apply of `0004`: PASS,
- `PRAGMA foreign_key_check`: PASS,
- existing seed retained: 5 Services / 12 Portfolio Projects / 16 Inquiry options,
- new Clients tables start empty,
- inquiry conversion uniqueness/idempotency constraint: PASS,
- referenced client hard-delete restriction: PASS.

NX-CORE-2 runtime parity was rerun unchanged:

- public/API Worker parity: **21/21 PASS**,
- authenticated Admin Worker parity: **10/10 PASS**.

A protected-baseline manifest proves every pre-existing file in the NX-CORE-2 full baseline remains byte-identical.

## Remote apply procedure

Use the overlay only inside the **existing Cloudflare project that already has the production D1 `DB` binding**.

Validation only:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\APPLY_NX_DATA_1.ps1
```

After owner approval for the live data gate:

```powershell
.\scripts\APPLY_NX_DATA_1.ps1 -ApplyRemote
```

The script deliberately refuses to create a replacement D1 database when the binding is missing. It only applies pending migrations to the already-bound database, then runs the existing runtime check.

## Gate

Do not begin Clients UI/API, Inquiry → Client conversion, `client_projects`, Tasks, Tickets, Billing, or Client Portal until the remote D1 migration state and existing runtime checks are accepted.

Next implementation gate after acceptance:

```text
NX-OPS-1 — Clients API/UI + controlled Inquiry → Client conversion
```
