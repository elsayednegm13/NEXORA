# NEXORA — NX-CORE-2 Modular Foundation Refactor

## Status

**Implementation candidate complete. Static + deterministic Worker parity gate: PASS.**

This phase is a behavior-preserving refactor built only on the locked Phase 6.2 baseline.
It introduces **no new business feature, no D1 migration, no schema/data change, and no public-site redesign**.

## Goal

Prevent the Phase 6.2 monoliths from becoming the foundation for Clients, Client Projects, Tickets, Billing and Portal code.
The refactor creates stable module boundaries before those domains are implemented.

## Worker runtime structure

```text
src/
├── worker.js
├── api-router.js
├── core/
│   ├── errors.js
│   ├── http.js
│   ├── validation.js
│   ├── crypto.js
│   ├── auth-admin.js
│   ├── audit.js
│   ├── rate-limit.js
│   └── router.js
└── modules/
    ├── public/
    │   ├── services.js
    │   └── projects.js
    ├── inquiries/
    │   └── public.js
    ├── admin/
    │   ├── auth.js
    │   ├── dashboard.js
    │   └── inquiries.js
    └── cms/
        ├── projects-admin.js
        └── services-admin.js
```

`src/worker.js` is now only the Worker entrypoint/static-assets boundary. Existing `/api/v1` routing lives in `api-router.js` and domain logic is split by ownership.

## Admin runtime structure

```text
public/admin/js/
├── admin.js
├── app.js
├── core/
│   ├── state.js
│   ├── dom.js
│   ├── i18n.js
│   ├── theme.js
│   ├── api.js
│   ├── ui.js
│   ├── router.js
│   └── auth.js
└── modules/
    ├── overview.js
    ├── inquiries.js
    ├── portfolio-projects.js
    └── services.js
```

The visible Admin module inventory remains exactly:

```text
Overview
Inquiries
Projects
Services
```

No Client/Operations/Billing/Portal navigation has been exposed prematurely.

## Protected Phase 6.2 behavior

- Public API routes: unchanged.
- Admin API routes: unchanged.
- API JSON envelopes: unchanged.
- Admin auth/session/CSRF/password behavior: unchanged.
- Inquiry validation/idempotency/rate limiting: unchanged.
- Inquiry 20-second Live Sync + focus/visibility refresh: unchanged.
- Inquiry status catalog/history/note behavior: unchanged.
- Portfolio project editor contract: unchanged.
- Service editor contract: unchanged.
- AR/EN: unchanged.
- Dark/Light: unchanged.
- Public website files: byte-identical.
- D1 migrations/data: unchanged.

## D1

Migration inventory remains:

```text
0001_schema.sql
0002_seed.sql
0003_inquiry_locale.sql
```

NX-CORE-2 does not add `0004`.

## Regression control

Run:

```powershell
node .\scripts\NX_CORE_2_CHECK.mjs
```

The gate verifies:

1. Phase 6.2 protected-file SHA-256 manifest.
2. Admin HTML shell changed only from classic script loading to ES-module loading.
3. No migration inventory change.
4. Exact current API route inventory.
5. Required modular boundaries.
6. 20-second Inquiry live-sync guard.
7. Existing Inquiry status catalog.
8. Existing visible Admin modules only.
9. Runtime JavaScript syntax.
10. Public Worker behavior parity against the frozen Phase 6.2 Worker fixture.
11. Authenticated Admin Worker behavior parity against the same fixture.

## Deployment policy

`APPLY_NX_CORE_2.ps1` validates by default and does **not** deploy unless `-Deploy` is explicitly supplied.

```powershell
.\scripts\APPLY_NX_CORE_2.ps1
```

After owner review, live deployment can be invoked explicitly:

```powershell
.\scripts\APPLY_NX_CORE_2.ps1 -Deploy
```

No D1 migration command is executed by this phase.

## Next gate

Do not author `0004_clients_core.sql` until:

1. this candidate is reviewed;
2. the Phase 6.2 admin flows are accepted in a real browser after deployment;
3. live Cloudflare runtime/API checks pass.

Only then can NX-OPS / Clients implementation begin.
