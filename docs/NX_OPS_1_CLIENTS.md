# NEXORA — NX-OPS-1 Clients + Inquiry → Client Conversion

## Status

**Implementation complete in the review build. Remote Cloudflare deployment / live D1 acceptance is not claimed from this environment.**

This phase is built on the locked chain:

```text
Phase 6.2
  + NX-CORE-2 Modular Foundation
  + NX-DATA-1 / migrations/0004_clients_core.sql
  → NX-OPS-1 Clients API/UI
```

NX-OPS-1 is intentionally limited to the **Clients domain** and controlled conversion from an existing Project Inquiry. It does **not** start Client Projects, Tasks, Milestones, Tickets, Portal, Quotes, or Invoices.

---

## 1. Scope implemented

### Admin Clients module

A real **Clients** view is added under the Sales group in the existing NEXORA Admin shell.

Capabilities:

- list clients;
- search by client identity, billing email, or contact data;
- filter by client status;
- cursor pagination from day one;
- create a client manually;
- edit client identity and billing profile fields;
- archive and restore using status — no hard delete;
- manage multiple contacts;
- maintain one logical primary contact through server-side service rules;
- mark contacts active/inactive instead of deleting history;
- view source inquiries that were converted/linked to the client.

No empty future navigation items are added.

### Inquiry → Client conversion

An Inquiry that has not been converted shows a controlled action in its existing detail drawer.

Two conversion modes are supported:

1. **Create new client** from the inquiry context.
2. **Link to existing active client**.

The conversion deliberately **does not change the Inquiry status automatically**. Sales lifecycle state remains an explicit administrator decision.

If the same inquiry conversion request is retried, the unique conversion mapping is authoritative and the API returns the existing conversion rather than creating a duplicate client/link.

---

## 2. Existing schema used — no new migration

NX-OPS-1 does not introduce `0005`.

It uses the already-reviewed NX-DATA-1 migration:

```text
0004_clients_core.sql
```

Tables used:

```text
clients
client_contacts
inquiry_conversions
```

The migration bytes are locked by SHA-256 in the NX-OPS-1 gate.

`projects` remains the **public Portfolio Project** table. Nothing in NX-OPS-1 reinterprets it as an internal client project.

---

## 3. Admin API contract added

Authenticated Clients routes:

```text
GET   /api/v1/admin/clients/config
GET   /api/v1/admin/clients
POST  /api/v1/admin/clients
GET   /api/v1/admin/clients/:id
POST  /api/v1/admin/clients/:id/update
PATCH /api/v1/admin/clients/:id

POST  /api/v1/admin/clients/:id/contacts
POST  /api/v1/admin/clients/:id/contacts/:contactId/update
PATCH /api/v1/admin/clients/:id/contacts/:contactId
```

Controlled inquiry conversion:

```text
POST /api/v1/admin/inquiries/:id/convert-client
```

Existing Inquiry detail responses gain one **additive internal Admin field**:

```text
conversion: null | {
  id,
  client_id,
  client_public_id,
  client_display_name,
  client_status,
  converted_at,
  converted_by_admin_name
}
```

The public Inquiry API is unchanged.

---

## 4. Security / authority rules

All Clients state-changing handlers enforce the existing NEXORA Admin controls:

```text
same-origin write guard
+ authenticated Admin
+ CSRF token
+ server-side validation
+ audit event
```

The browser never decides conversion idempotency, status validity, or authoritative persistence rules.

### Public IDs

New client/contact public identifiers use random non-sequential values:

```text
cli_<random>
ctc_<random>
```

Numeric database IDs remain Admin-internal identifiers only. They are **not** a Client Portal access mechanism.

### No Client Portal access yet

`client_contacts.portal_enabled` remains `0` in this phase.

NX-OPS-1 does not expose:

- magic links;
- client login;
- portal tokens;
- client-safe portal DTOs;
- public client routes.

Those remain behind the later Client Portal security gate.

### No hard delete

There is no Admin `DELETE` route for Clients or Client Contacts.

Client lifecycle:

```text
active
on_hold
archived
```

Contact lifecycle:

```text
active
inactive
```

Historical Inquiry conversion references remain intact.

---

## 5. Inquiry conversion integrity

`inquiry_conversions.project_inquiry_id` is unique.

The Worker checks for an existing mapping before conversion and the database uniqueness rule protects against retry/race duplication.

For new-client conversion, the client, optional primary contact, and conversion mapping are issued as one D1 batch. The conversion records a provenance snapshot in `context_json`, including:

- Inquiry public ID;
- Inquiry status at conversion;
- source Service / Package / Portfolio Project context where available;
- submission language.

A linked existing client must not be archived.

The original Inquiry is preserved and remains independently auditable.

---

## 6. Pagination policy

Clients are the first growing operational collection, so offset pagination is intentionally avoided.

The list is ordered by:

```text
updated_at DESC, id DESC
```

and uses an opaque cursor containing only the server continuation position.

Current page size:

```text
50
```

Response shape:

```json
{
  "items": [],
  "meta": {
    "count": 0,
    "has_more": false,
    "next_cursor": null
  }
}
```

---

## 7. Admin UX rules

The existing Admin shell remains NEXORA-native and bilingual.

Visible real modules after NX-OPS-1:

```text
Overview

SALES
  Inquiries
  Clients

WEBSITE
  Portfolio Projects
  Services
```

No Tasks/Tickets/Billing/Portal placeholder pages are rendered before their domains exist.

Clients UI supports:

- Arabic / English;
- Dark / Light theme via the existing shell;
- desktop/tablet/mobile CSS rules;
- create/edit drawer workflows;
- primary-contact management;
- Inquiry source history;
- safe navigation from Inquiry → Client and Client → source Inquiry.

Draft client/contact/conversion form values are preserved when the administrator changes the Admin interface language while editing.

---

## 8. Explicitly unchanged

NX-OPS-1 does not change:

- the 35 public non-Admin website files;
- public project pages;
- Portfolio `projects` semantics;
- Services public behavior;
- Contact public flow;
- Phase 6.2 Inquiry Live Sync interval;
- Admin authentication/session/CSRF model;
- existing Project and Service Admin write contracts;
- migrations `0001..0004`;
- Cloudflare Secrets;
- D1 binding identity.

---

## 9. Not implemented yet

The following are intentionally blocked until later approved gates:

```text
client_projects
client project members
milestones
tasks
operations activity timeline
service tickets
SLA / paid priority
Client Portal access grants
quotes
invoices
payments
private files / R2 links
```

No `0005_client_projects` migration is included.

---

## 10. Verification gate

The local deterministic gate runs:

```powershell
node .\scripts\NX_OPS_1_CHECK.mjs
```

It proves:

- 99 protected NX-DATA-1 files remain byte-identical;
- all 35 public non-Admin files remain byte-identical;
- migration inventory is exactly `0001..0004` and all migration hashes match;
- API route inventory is exact;
- no Admin DELETE route;
- no future Project Management/Billing/Portal route introduced early;
- no destructive SQL in the Clients runtime module;
- Portal remains disabled;
- Admin visible view inventory contains only real modules;
- HTML duplicate-ID gate;
- CSS structural gate;
- JavaScript syntax;
- frozen public/unauthenticated Worker parity: **21/21**;
- existing authenticated Admin compatibility: **10/10**;
- real SQLite/D1-compatible Clients integration tests covering auth, CSRF/origin, validation, contacts, archive/restore, conversion idempotency, provenance, pagination, audit and FK integrity.

---

## 11. Remote application / live acceptance

From the **existing bound NEXORA Cloudflare project**, after owner approval:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\APPLY_NX_OPS_1.ps1 -DeployRemote
```

The script must use the existing `DB` binding. It must **not create a replacement D1 database or reset Secrets**.

Live acceptance checklist after deployment:

1. Existing Home / Services / Work / Project / Contact pages load normally.
2. Admin Login works.
3. Phase 6.2 Inquiries and live refresh still work.
4. Open **Clients**; list loads from the existing D1.
5. Create one harmless test client and refresh to prove persistence.
6. Add a second contact, make it primary, and confirm there is still only one primary.
7. Archive then restore the harmless test client.
8. Create/use a controlled test Inquiry and convert it to a new client.
9. Repeat the conversion request/action and verify no duplicate Client is created.
10. Link another test Inquiry to an existing active Client.
11. Confirm the Inquiry status did not change automatically.
12. Test AR/EN and Dark/Light.
13. Test Desktop/Tablet/Mobile layout in a real browser.
14. Confirm no Client Portal access exists yet.

The phase is production-approved only after this live gate is recorded.

---

## 12. Next gate

After NX-OPS-1 live acceptance only:

```text
NX-DATA-2 — 0005_client_projects.sql
```

That next phase will introduce the **internal** `client_projects` domain while preserving the public Portfolio `projects` domain unchanged.
