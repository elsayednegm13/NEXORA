# NEXORA NX-COLLAB-1 UI R4 — Final Engineering Check

## Release decision

**Local engineering status: PASS**  
**Remote deployment status: NOT STARTED**  
**Release type: CODE / ASSETS ONLY**

R4 corrects the browser-acceptance failure discovered after NX-COLLAB-1 R3 went Live. The Live R3 backend foundation, D1 migration `0010_client_project_collaboration.sql`, Durable Object realtime architecture, and private R2 bucket remain the accepted baseline. R4 does not add a migration, create infrastructure, modify Secrets, or seed business data.

## Root cause closed by R4

The Client Project feature was functionally present but still rendered inside the legacy narrow Admin drawer. This compressed Tickets and Files, hid Client Access from normal discoverability, and did not match the approved NEXORA workspace architecture. The Client Portal also still carried an Admin-only Client Access concept and did not have the required mobile/list-detail and realtime draft behavior.

R4 replaces this with a dedicated Admin Project Workspace and a separately designed Client Portal. The release adds a real Chromium geometry gate so future acceptance cannot be declared from static string/CSS checks alone.

## Admin R4

- Dedicated viewport-sized Client Project Workspace; no legacy narrow drawer dependency for project work.
- Compact Project identity/progress header and primary module navigation.
- Primary visible modules: Overview, Execution, Tickets & Support, Project Files, Client Access.
- Client Access remains Admin-only and exposes Generate / Copy / Revoke link workflow.
- Tickets use a wide split workspace with local scrolling and mobile list/detail navigation.
- Project Files use folder/list/preview architecture and contain image previews rather than oversized image rendering.
- AR/EN, Dark/Light and responsive geometry retained.
- No native `window.confirm` or `prompt` dialogs.

## Client Portal R4

- Exactly three safe top-level modules: Project Overview, Project Execution, Tickets & Support.
- Client Access removed completely from client-facing navigation/content.
- Client-facing shell uses NEXORA visual language but lower density than Admin.
- Desktop Tickets use approximately 34/66 list/detail allocation.
- Mobile has explicit list/detail state and visible Back action.
- Closed ticket hides reply composer and exposes New Ticket CTA; server-side 409 authority remains unchanged.
- New ticket is inserted locally as soon as its POST succeeds; attachment synchronization cannot falsely convert a successful ticket creation into a failed-ticket UI state.
- Reply drafts and selected-ticket state are preserved across realtime reconciliation.
- Background incoming messages do not force-scroll a user who is reading older messages; a New Messages action is shown instead.
- WebSocket reconnect uses heartbeat, backoff/jitter, authoritative resync, visibility awareness, and fallback polling.
- Voice notes, image/PDF/audio preview, private file download and ticket attachments remain supported.
- Mobile/tablet header uses the NEXORA mark rather than a cropped wordmark.

## Client DTO privacy hardening

During the R4 review, three client-output leaks were identified and removed without changing database/business rules:

- Client file DTO no longer exposes numeric database ids, folder/ticket/message ids, SHA-256 metadata, visibility, or creator type.
- Realtime client events no longer expose the numeric internal Project id.
- Client ticket responses no longer reveal Admin assignment/name; Admin-facing authors/events are normalized to `NEXORA`.
- Internal attachment-to-message association remains server-side and is stripped before the public DTO is returned.

## Protected baseline / data guarantees

- R3 Live baseline protected outside the explicitly reviewed R4 surface.
- `0010_client_project_collaboration.sql` is byte-identical to deployed R3.
- Migration inventory remains exactly `0001..0010`.
- API route inventory remains 89 route guards.
- No HTTP DELETE route introduced.
- Cloudflare `wrangler.jsonc`, D1 identity, R2 binding and Durable Object binding remain protected R3 files.

## Automated evidence

The R4 engineering gate passed:

- NX-DATA-5 schema proof.
- Full historical schema regression through 0010.
- NX-COLLAB-1 Worker integration including safe attachment DTO association.
- NX-COLLAB-1 R4 UI contract.
- Public/unauthenticated Worker parity: 21/21.
- Existing authenticated Admin compatibility: 10/10.
- Runtime JavaScript syntax.
- Public HTML duplicate-ID check.
- Primary CTA white-text contract.
- Font Awesome rendering regression scan.
- Real Chromium geometry/architecture gate.

Real-browser geometry cases passed for Admin:

`Support 1440/1280/1024/768/390/360`, `Files 1440/1024/390`, `Client Access 1440/390`.

Real-browser geometry cases passed for Client Portal:

`Support 1440/1280/1024/768/390/360`, `Closed Ticket 1440/390`, `Execution 1440/1024/390`, `Overview Light 1440/390`, `New Ticket Drawer 1440/390`.

## New release safety rule

A Client Project UI release cannot close from static contracts alone. The R4 browser gate must prove viewport sizing, no document overflow, ticket pane ratios, Client Access Admin discoverability, Client Access absence from Portal, mobile list/detail behavior, closed-ticket CTA, compact execution layout, file preview containment, mobile icon-only branding, and new-ticket drawer geometry.

## Owner gate

Use only:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\RUN_NX_COLLAB_1_UI_R4_RELEASE.ps1
```

The default command is read-only. It validates package hashes, creates a clean temporary stage, parses the PowerShell apply script, performs Wrangler `deploy --dry-run`, runs the full R4 engineering/browser gate, verifies existing D1/R2/migration/FK state and production counts, and checks current Live runtime.

Do not use `-DeployRemote` until the read-only R4 CODE GATE output has been reviewed.
