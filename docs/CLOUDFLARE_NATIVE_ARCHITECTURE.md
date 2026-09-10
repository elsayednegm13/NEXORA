# NEXORA — Cloudflare Native Architecture

## Runtime

```text
Cloudflare Workers Static Assets
├─ Home / Services / Work / Project / Contact
├─ Admin UI
└─ /api/v1/* → Worker Router → D1
```

## Infrastructure replacement only

Phase 6.1 يستبدل:

```text
PHP API       → Cloudflare Worker
MySQL/MariaDB → Cloudflare D1
Plesk         → Cloudflare Workers Static Assets
```

ولا يغير الـpublic UX أو AR/EN أو Dark/Light أو responsive behavior أو contracts المستخدمة في الـfrontend repositories.

## D1 binding

Binding name is fixed as:

```text
DB
```

The first-deploy script creates `nexora-db` and lets Wrangler write the real database UUID into `wrangler.jsonc`.

## Static assets

`public/` is the only browser-exposed directory. Server-side PHP, `.env`, MySQL files and Plesk `.htaccess` files are intentionally absent.

## Data model preserved

- media_assets
- technologies
- services
- service_capabilities
- service_technologies
- projects
- project_services
- project_technologies
- project_media
- project_results
- people
- packages
- package_features
- inquiry_option_items
- admin_users
- project_inquiries
- project_inquiry_services
- project_inquiry_status_history
- api_rate_limits
- site_settings
- audit_logs

## Admin authentication

PHP sessions are replaced by a signed stateless cookie. The Worker verifies the HMAC signature and expiration, then verifies the admin is still active in D1. CSRF is derived from the signed session nonce and must be sent through `X-CSRF-Token` on state-changing admin requests.

## Passwords

New D1 admin accounts use PBKDF2-SHA256 with a per-password random salt. The old MySQL admin password hash is not copied automatically; Phase 6.1 starts with an empty `admin_users` table and the admin is created once through `/admin/setup.html`.

## Inquiry atomicity

A new inquiry is created using a D1 batch containing:

1. `project_inquiries` insert
2. requested service relation inserts
3. initial `new` status history insert

This preserves the original business invariant without a server-managed MySQL transaction.

## Future dashboard work

The current Phase 6.0 dashboard CRUD scope remains intact. Future Phase 6.2 can expand Technologies, media/gallery, package management and people without redesigning the existing public pages.
