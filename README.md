# NEXORA Technologies — Cloudflare-Native Company Platform

[النسخة العربية من هذا الدليل](README-AR.md)

The NEXORA Technologies company website and admin platform, running fully on the Cloudflare edge: **Workers + D1 + R2 + Durable Objects**. This version moves the backend and database from PHP/MySQL to a Cloudflare Worker with a D1 database while preserving the public site design, the API contract, and the admin dashboard.

No VPS, Docker, PHP, MySQL, or Supabase required.

## What the platform includes

- **Public company website** — services, projects, work, and contact pages served as static assets from the same Worker, with a bilingual (Arabic/English) interface.
- **Project inquiries** — a public inquiry form with server-side validation, honeypot, idempotency, and rate limiting.
- **Admin dashboard** — manage services, projects, and inquiries, with Arabic/English and dark/light themes.
- **Clients and client projects** — client records, project execution tracking, and a dedicated **client project portal** where customers follow their own project.
- **Realtime collaboration** — per-project ticket threads with messages, attachments, and private files, powered by Cloudflare Durable Objects for live sync and R2 for private file storage.
- **CMS-style content management** — services and projects are managed from the dashboard and served through the preserved public API.

## Architecture

```text
Browser
  ├─ Static Assets (public/)
  └─ /api/v1/*
        ↓
Cloudflare Worker (src/worker.js)
        ↓
D1 binding: DB
```

Source layout:

```text
src/
  worker.js             # Worker entrypoint
  cloudflare-worker.js  # Deployment entrypoint (Durable Object bindings)
  api-router.js         # /api/v1 router
  core/                 # Shared core (auth, security, storage)
  modules/
    admin/              # Admin dashboard API
    cms/                # Services and projects content
    inquiries/          # Public project inquiries
    operations/         # Clients and client projects
    public/             # Public site endpoints
public/                 # Website and admin dashboard static assets
migrations/             # D1 migrations (0001 schema → 0010 client project collaboration)
scripts/                # PowerShell release and verification tooling
docs/                   # Architecture and release documentation
```

The most important rule of this version: the public interface from Phase 6.0 is preserved as-is. Only the admin setup text changed, to point at a Cloudflare Worker secret instead of `nexora_app/.env`.

## First deploy — PowerShell

From inside the project folder:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\FIRST_DEPLOY.ps1
```

The script:

1. Installs Wrangler locally.
2. Signs in to Cloudflare when needed.
3. Creates a D1 database named `nexora-db` and binds it to the Worker as `DB`.
4. Applies the migrations: schema, then seed.
5. Deploys the current Worker as `nexoratechnologies` with all site files.
6. Generates strong admin secrets and uploads them to Cloudflare.
7. Prints the `ADMIN_SETUP_KEY` once, for creating the first admin account.

Then open:

```text
https://<your-worker>.workers.dev/api/v1/health
https://<your-worker>.workers.dev/api/v1/health/db
https://<your-worker>.workers.dev/admin/setup.html
```

## Later updates

Do not recreate D1 and do not change the secrets. Use:

```powershell
.\scripts\UPDATE_DEPLOY.ps1
```

## Runtime check

```powershell
.\scripts\RUNTIME_CHECK.ps1
```

Or, if the domain changed:

```powershell
.\scripts\RUNTIME_CHECK.ps1 -BaseUrl "https://example.com"
```

Major releases also ship with their own read-only preflight runners (for example `scripts/RUN_NX_COLLAB_1_RELEASE.ps1`), which validate Node/Wrangler versions, file hashes, clean staging, and a Cloudflare dry-run before any remote deploy.

## Local development

```bash
npm install
npm run dev            # wrangler dev
npm run db:migrate:local
npm run deploy         # wrangler deploy
npm run db:migrate:remote
```

## Preserved API

```text
GET  /api/v1/health
GET  /api/v1/health/db
GET  /api/v1/services
GET  /api/v1/services/:slug
GET  /api/v1/projects
GET  /api/v1/projects/:slug
GET  /api/v1/project-inquiries/config
POST /api/v1/project-inquiries

GET  /api/v1/admin/setup/status
POST /api/v1/admin/setup
POST /api/v1/admin/auth/login
GET  /api/v1/admin/auth/me
POST /api/v1/admin/auth/logout
GET  /api/v1/admin/dashboard
GET  /api/v1/admin/inquiries
GET  /api/v1/admin/inquiries/:id
POST /api/v1/admin/inquiries/:id/update
GET  /api/v1/admin/projects
POST /api/v1/admin/projects/:id/update
GET  /api/v1/admin/services
POST /api/v1/admin/services/:id/update
```

## Security

- Admin session: signed `HttpOnly + Secure + SameSite=Strict` cookie.
- CSRF token required for admin writes.
- Admin passwords: PBKDF2-SHA256 with random salt.
- Setup is only allowed before the first admin exists.
- Setup, session, and IP-hashing secrets are stored as Cloudflare Worker secrets, not in source files.
- The contact endpoint retains its honeypot, server-side validation, idempotency, and rate limiting.
- D1 writes for a new inquiry, its service links, and its initial status history use `D1.batch()`, so the batch rolls back if any statement fails.

## Database

```text
migrations/0001_schema.sql
migrations/0002_seed.sql
…
migrations/0010_client_project_collaboration.sql
```

The seed does not invent Technologies, Results, or project descriptions. Optional data stays empty until real data is added from the dashboard.

## Documentation

- `docs/CLOUDFLARE_NATIVE_ARCHITECTURE.md` — platform architecture.
- `docs/POWERSHELL_DEPLOY_AR.md` — Arabic deployment guide.
- `docs/PHASE6_1_FINAL_CHECK.md` — Phase 6.1 release report.
- Per-release reports (`NX_*_FINAL_CHECK.md`) document each subsequent release gate.
