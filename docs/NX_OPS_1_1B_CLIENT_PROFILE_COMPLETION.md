# NEXORA — NX-OPS-1.1B Secure Client Profile Completion

## Status

Local engineering implementation is complete and passes the deterministic gate.

**Remote Worker deployment: pending owner live preflight/deploy.**

No migration is introduced in this phase. The accepted migration chain remains exactly `0001..0006`; `client_profile_tokens` already exists from NX-DATA-1.1.

## Scope

NX-OPS-1.1B adds a single-purpose profile-completion capability:

1. Admin creates the Client through the existing Clients module.
2. Admin generates a secure completion link for an **active** Client.
3. Only a SHA-256 hash of the random token is stored in D1.
4. The generated URL places the raw token in the URL **fragment**, not the query string, so it is not sent in the initial page request or Referrer.
5. Client opens `/client-profile.html`, reviews the permitted fields, and submits them to the same Client record.
6. The token is consumed once on successful completion.
7. Admin may revoke the current link or generate a replacement link; generation revokes earlier unfinished links.
8. Deactivating or archiving a Client revokes unfinished completion links.

This is **not** Client Portal access. It does not create accounts, sessions, projects, tickets, quotes, invoices, files, or portal grants.

## Admin API

```text
GET  /api/v1/admin/clients/:id/profile-completion
POST /api/v1/admin/clients/:id/profile-completion/generate
POST /api/v1/admin/clients/:id/profile-completion/revoke
```

Admin write endpoints retain all accepted controls:

- authenticated Admin session;
- same-origin guard;
- CSRF token;
- audit logging;
- no raw token in audit context.

The raw completion URL is returned only from the generation response. Since the raw token is never stored in D1, a lost link is replaced by generating a new one.

## Public API

```text
POST /api/v1/client-profile/resolve
POST /api/v1/client-profile/complete
```

Both are same-origin capability endpoints and are D1 rate-limited by IP and token hash.

Unavailable, revoked, completed, expired, or non-active Client links resolve to the same generic unavailable response.

## Token security

- 32 cryptographically random bytes (`256-bit`).
- Base64URL raw token.
- D1 stores only `SHA-256(token)` in `token_hash`.
- Default lifetime: 7 days.
- One Client per token.
- One successful completion per token.
- Revocable by Admin.
- Regeneration rotates the capability and revokes previous unfinished tokens.
- Deactivate/archive revokes unfinished tokens.
- Raw token is excluded from D1 rows, audit context, and status responses.
- Generated link uses `/client-profile.html#token=...`, not `?token=...`.

## Client-safe DTO

Client-facing resolution exposes only:

```text
client_code          read-only
client_type          read-only
default_currency     read-only
profile.display_name
profile.legal_name
profile.preferred_language
profile.billing_name
profile.billing_email
profile.billing_phone
profile.billing_address_line1
profile.billing_address_line2
profile.billing_city
profile.billing_region
profile.billing_postal_code
profile.billing_country_code
profile.tax_identifier (Company only)
```

It does not expose Client status, IDs/public IDs, contacts, Inquiry history, Admin identity, audit data, archive metadata, Portal state, or future operations/financial data.

Client submission cannot mutate:

```text
Client Code
Client Type
Status
Default Currency
Archive/Delete state
Inquiry provenance
Admin/audit data
Portal permissions
```

Individual clients always persist `tax_identifier = NULL` server-side.

## UX/UI standard applied

### Admin notifications

The global Admin toast is now positioned at the top edge using logical direction:

- EN / LTR → top-right;
- AR / RTL → top-left.

It is visually differentiated by semantic icon/border for success, error, warning, and info. Only one toast is shown at a time, avoiding noisy stacking.

Success messages are short and user-facing. Internal implementation notes such as ID/code sequencing are not rendered in lifecycle panels or success notifications.

### Admin Client drawer

A Client Profile Completion card shows only operational state:

```text
No link
Active
Completed
Expired
Revoked
Unavailable
```

Available actions are:

```text
Generate link / Generate new link
Copy link (only when the current browser has the newly generated raw URL)
Revoke link
```

No raw token is reconstructable from the D1-stored hash.

### Client page

`/client-profile.html` is a dedicated NEXORA page with:

- AR / EN;
- RTL / LTR;
- Dark / Light;
- Desktop / Tablet / Mobile;
- accessible form labels and live status regions;
- company-only Tax Identifier;
- read-only Client Code, Client Type, and Currency;
- same notification placement rule using logical direction;
- no technical or architecture notes.

## Verification

Local gate:

```powershell
node .\scripts\NX_OPS_1_1B_CHECK.mjs
```

Verified:

- pre-existing NX-OPS-1.1A baseline protected outside approved surface;
- all 35 existing public-site files byte-identical;
- migrations exactly `0001..0006`, all byte-identical;
- exact API inventory: 42 routes including OPTIONS;
- no generic HTTP DELETE;
- no Client Portal/Projects/Tasks/Tickets/Billing exposure;
- 256-bit capability generation;
- hash-only token storage;
- token rotation, revocation, expiration, and replay rejection;
- same-origin and Admin CSRF negatives;
- public DTO deny-by-default;
- Client Code / type / lifecycle remain server-owned;
- Company/Individual Tax Identifier rules;
- deactivation revokes completion links;
- audit events without raw token leakage;
- NX-DATA-1.2 regression;
- public Worker parity `21/21`;
- existing authenticated Admin compatibility `10/10`;
- NX-OPS-1.1A integration/UI regression;
- NX-OPS-1.1B integration/UI contract;
- HTML duplicate IDs, CSS structure, JS syntax.

## Live procedure

Read-only preflight first:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\APPLY_NX_OPS_1_1B.ps1
```

After owner review only:

```powershell
.\scripts\APPLY_NX_OPS_1_1B.ps1 -DeployRemote
```

The apply script never creates/replaces D1, never applies migrations, never resets Secrets, and does not generate a real profile token during preflight/deployment.

## Real-browser acceptance after deployment

1. Admin → Clients → open an active Client.
2. Generate completion link.
3. Copy it and open it in a clean/private browser session.
4. Verify Client Code/Type/Currency are read-only.
5. Verify Company shows Tax Identifier; Individual does not.
6. Save permitted fields and confirm the same Client record changes in Admin.
7. Retry the same link and verify it is unavailable after successful completion.
8. Generate another link and revoke it; verify it stops working.
9. Generate another link, deactivate the Client, and verify the link stops working.
10. Verify Admin notifications and client-page notifications in AR/EN + Dark/Light.
11. Verify Desktop/Tablet/Mobile.
12. Confirm no Client Portal navigation/account access exists.

After this acceptance passes, the Clients domain can be closed and the next data gate may introduce internal Client Projects using the next available migration number (`0007` at the current chain).
