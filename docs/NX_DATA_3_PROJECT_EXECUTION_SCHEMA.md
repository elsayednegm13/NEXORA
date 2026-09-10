# NEXORA — NX-DATA-3 Project Execution Schema

## Decision
NX-DATA-3 adds the execution data layer for internal `client_projects` only. Public `projects` remains the Website Portfolio/CMS domain and is not altered or referenced by this migration.

## Migration
`0008_client_project_execution.sql` is forward-only and additive. It creates exactly:

- `client_project_milestones`
- `client_project_tasks`
- `client_project_task_assignees`

It does not backfill business rows and does not add Tasks/Milestones to the public Portfolio domain.

## Milestones
A milestone belongs to one Client Project and carries random `public_id`, title/description, service-authoritative status, sort order, optional target date, completion timestamp, audit ownership timestamps and archive state. Normal lifecycle is archive/restore; no hard-delete API is introduced.

## Tasks
A task belongs to one Client Project and can optionally belong to a milestone from the **same project**. The composite foreign key `(client_project_id, milestone_id)` prevents cross-project milestone assignment even if service validation is bypassed.

Task workflow/status and priority catalogs remain Worker-owned, not DB CHECK catalogs. Stable structural invariants such as non-negative sort order remain DB-enforced.

## Assignees
Task assignees are Admin users who must already be members of the same Client Project. The database enforces this with a composite FK to `client_project_members(client_project_id, admin_user_id)`. This prevents assigning a task to an Admin who is not part of the project team.

## Progress
No new column is required on `client_projects`; the existing service-authoritative `progress_mode` can now be `manual` or `calculated`. Calculated progress is derived server-side from non-archived, non-cancelled Tasks. Browser-supplied progress is never authoritative in calculated mode.

## Explicitly excluded
NX-DATA-3 does not create Tickets/SLA, Quotes, Invoices, Payments, Client Portal authority/sessions, private files, comments/chat, or time tracking.

## Deployment gate
Data apply and Worker deploy are intentionally separate owner gates:

1. Read-only preflight must prove the only pending migration is `0008_client_project_execution.sql`.
2. `-ApplyDataRemote` applies only 0008, verifies the three tables start empty, checks FKs, and proves protected production counts did not change.
3. Worker/Admin deployment happens later with `-DeployRemote` only after there are no pending migrations.
