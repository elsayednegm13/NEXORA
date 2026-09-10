# NEXORA Phase 6.2 — Inquiry UX + Live Sync

## Scope
This phase upgrades only the inquiry/admin workflow and keeps the approved public design and Cloudflare architecture intact.

## Changes
- Bilingual inquiry display: project stage, timeline, budget mode, preferred contact and statuses are rendered in the current Admin language.
- The contact form now sends the submission language (`ar` / `en`) for future inquiries.
- D1 migration `0003_inquiry_locale.sql` adds `submission_language` without deleting or recreating the database.
- Requested services use localized titles and modern visual service cards.
- Inquiry descriptions use `dir="auto"` so Arabic and English visitor text is displayed naturally.
- Status dropdown and status history are localized.
- Status history supports an optional note for each status change.
- Automatic inquiry refresh checks the dashboard every 20 seconds while the Admin tab is visible and checks immediately when the tab regains focus.
- New inquiries refresh the inquiry list and show an in-dashboard notification; no browser refresh is required.
- Dashboard system labels now match the deployed architecture: Static Assets / Worker API / D1 Database / Admin Session.
- Existing Phase 6.1.1 admin authentication hotfix and Phase 6.1.2 Light Mode parity are preserved.

## Deployment
Extract the Phase 6.2 overlay over the existing local Cloudflare project folder. Do not replace or recreate `wrangler.jsonc`, D1, or Worker secrets.

Then run from PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\APPLY_6_2_INQUIRY_UX.ps1
```

When Wrangler asks to apply the pending D1 migration, choose `Y`.

## Data safety
- No table is dropped.
- No existing inquiry is deleted or rewritten.
- Existing inquiries will have `submission_language = NULL`; their option labels still localize correctly because the Admin reads the bilingual option catalog.
- New inquiries store the visitor's current site language.
