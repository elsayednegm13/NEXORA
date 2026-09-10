# NEXORA NX-COLLAB-1 — Realtime Collaboration + Private Project Files

## Goal

Turn the accepted NX-OPS-4 Portal/Support baseline into a realtime client-collaboration workspace without page reloads, while keeping D1 authoritative and keeping project file bytes private in Cloudflare R2.

## Architecture

- **D1** remains the source of truth for Project, Execution, Tickets, Messages, permissions and file metadata.
- **Durable Object / WebSocket** delivers project-scoped change notifications to Admin and Client Portal.
- **HTTP APIs** remain authoritative for all writes and snapshot/resync reads.
- **Private R2** stores binary file bytes. D1 stores folders, logical files, versions and Ticket attachment relations.
- A WebSocket event is a refresh signal, not business state. Clients re-read authoritative API state after an event and use periodic fallback resync if realtime is unavailable.

## Reliability

- Client ticket create is idempotent by `client_request_id` within the project.
- Ticket messages are idempotent by `client_request_id` within the ticket.
- File versions are idempotent by upload request id.
- A lost/retried HTTP response must not create a duplicate business item.

## Closed ticket rule

A Client Portal Ticket with `status=closed` cannot receive another client message or attachment. The UI removes the composer and the API independently rejects attempts with `409 / CLIENT_PORTAL_TICKET_CLOSED`. A new request requires a new Ticket.

## File model

- `client_project_folders`: virtual organization; no storage-key coupling.
- `client_project_files`: logical project file and display name/visibility/location.
- `client_project_file_versions`: immutable R2 object/version metadata.
- `client_project_ticket_attachments`: Ticket/Message relation.
- Renaming/moving a file changes D1 metadata, not the R2 object key.
- File lifecycle is archive/restore; no HTTP DELETE route is introduced.

Supported UX in this release foundation:

- Images: inline preview.
- PDF: embedded preview + download.
- Audio / voice notes: inline player.
- Other supported documents/archives: metadata + download.
- Admin: Project Files workspace, folder organization, upload, preview, download, rename/move/visibility, archive.
- Client: upload attachments within open Tickets and view/download client-visible attachments.

## UI architecture

Admin and Client Portal share semantic NEXORA tokens but use different information density. Tickets use a list + active-conversation workspace with local scrolling instead of long page stacking. Forms use focused drawers/workspaces. Dark and Light themes have separate semantic Success/Progress/Warning/Danger/Muted surfaces.

## Owner gates

The release is deliberately split:

1. **Read-only preflight**.
2. If missing: **R2 Infrastructure Gate** creates only `nexora-project-files`.
3. Read-only preflight again.
4. **NX-DATA-5 Gate** applies only `0010_client_project_collaboration.sql`.
5. Read-only preflight again.
6. **NX-COLLAB-1 Code Gate** deploys Worker/Admin/Portal + Durable Object binding/migration.
7. Real-browser two-window acceptance.

No gate combines R2 creation, D1 migration and Worker deployment.
