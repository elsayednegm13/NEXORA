# NEXORA — NX-DATA-4 Portal + Support Schema

## Scope

`0009_client_project_portal_support.sql` extends the accepted Client Project domain without changing the public Portfolio `projects` domain.

It introduces the data foundation required for secure project tracking links and client-originated support/testing tickets.

## Added visibility boundary

The migration adds `client_visible INTEGER NOT NULL DEFAULT 0` to:

- `client_project_milestones`
- `client_project_tasks`

The default is deny-by-default. Existing execution rows remain internal unless an Admin explicitly enables client visibility.

## Added tables

### `client_project_access_grants`

Project/contact-scoped access grants. D1 stores only `token_hash`; the raw access token is returned once to the Admin as part of the generated URL and is never stored in D1.

The grant carries explicit permissions for project progress, milestones, tasks, ticket creation and ticket comments.

### `client_portal_sessions`

Short-lived portal sessions created after exchanging the raw link token. D1 stores only `session_hash` and `csrf_hash`. Sessions can be revoked independently and are also revoked by grant/client/project lifecycle events.

### `client_project_tickets`

Project/client-bound support records with random `public_id`, server-generated `TKT-{id}` code, service-owned type/status/priority catalogs, one current project-member assignee and archive/restore lifecycle.

### `client_project_ticket_messages`

Ticket conversation records. Visibility is service-authoritative and supports `client` and `internal`; client-originated messages are always stored as client-visible.

### `client_project_ticket_events`

Business activity history for ticket lifecycle/status/priority/type/assignment/message events. This is separate from the security audit log.

## Locked boundaries

- `projects` remains the public Portfolio CMS domain.
- `client_projects` remains internal delivery/project-management.
- No Quotes, Invoices, Payments, Files, SLA automation or Email piping are introduced.
- No raw access/session/CSRF token is persisted.
- No evolving ticket status/type/priority catalog is frozen in DB `CHECK` constraints.
- No normal-runtime HTTP DELETE route is introduced.
- Migration is forward-only and contains no business-row backfill.
