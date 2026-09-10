# NEXORA Technologies — Phase 6.1 Cloudflare Native

هذه النسخة تنقل الباك إند وقاعدة البيانات من PHP/MySQL إلى **Cloudflare Worker + D1** مع الحفاظ على تصميم الواجهة والـAPI contract والـAdmin Dashboard.

## البنية

```text
Browser
  ├─ Static Assets (public/)
  └─ /api/v1/*
        ↓
Cloudflare Worker (src/worker.js)
        ↓
D1 binding: DB
```

لا تحتاج VPS أو Docker أو PHP أو MySQL أو Supabase.

## أهم قاعدة في هذا الإصدار

الواجهة العامة من Phase 6.0 محفوظة كما هي. تم تغيير نص إعداد المدير فقط ليشير إلى Cloudflare Worker Secret بدل `nexora_app/.env`.

## أول رفع — PowerShell

من داخل فولدر المشروع:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\FIRST_DEPLOY.ps1
```

السكريبت يقوم بالآتي:

1. تثبيت Wrangler محليًا.
2. تسجيل الدخول إلى Cloudflare عند الحاجة.
3. إنشاء D1 باسم `nexora-db` وربطه بالـWorker باسم `DB`.
4. تطبيق migrations: schema ثم seed.
5. نشر نفس Worker الحالي باسم `nexoratechnologies` مع كل ملفات الموقع.
6. إنشاء Secrets قوية للإدارة ورفعها إلى Cloudflare.
7. يطبع `ADMIN_SETUP_KEY` مرة واحدة لتستخدمه في إنشاء حساب المدير الأول.

بعدها افتح:

```text
https://nexoratechnologies.elsayedmohamed963.workers.dev/api/v1/health
https://nexoratechnologies.elsayedmohamed963.workers.dev/api/v1/health/db
https://nexoratechnologies.elsayedmohamed963.workers.dev/admin/setup.html
```

## تحديثات لاحقة

لا تعِد إنشاء D1 ولا تغيّر الـSecrets. استخدم:

```powershell
.\scripts\UPDATE_DEPLOY.ps1
```

## Runtime Check

```powershell
.\scripts\RUNTIME_CHECK.ps1
```

أو لو تغير الدومين:

```powershell
.\scripts\RUNTIME_CHECK.ps1 -BaseUrl "https://example.com"
```

## API المحفوظ

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
- CSRF token required for Admin writes.
- Admin passwords: PBKDF2-SHA256 with random salt.
- Setup only allowed before the first admin exists.
- Setup/session/IP hashing secrets are stored as Cloudflare Worker Secrets, not in source files.
- Contact endpoint retains honeypot, server-side validation, idempotency and rate limiting.
- D1 writes for a new inquiry + service links + initial status history use `D1.batch()` so the batch rolls back if a statement fails.

## Database files

```text
migrations/0001_schema.sql
migrations/0002_seed.sql
```

الـseed لا يخترع Technologies أو Results أو Project descriptions. البيانات الاختيارية تظل فارغة حتى تُضاف بيانات حقيقية من الـDashboard.

## تقارير هذا الإصدار

- `docs/PHASE6_1_FINAL_CHECK.md`
- `docs/POWERSHELL_DEPLOY_AR.md`
- `docs/CLOUDFLARE_NATIVE_ARCHITECTURE.md`
