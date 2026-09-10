# NEXORA — NX-OPS-3 Project Execution

## Scope
NX-OPS-3 turns the Client Project workspace into an execution workspace with Milestones, Tasks, assignment, and server-calculated progress.

### Milestones
- Create and edit.
- Pending / In Progress / Completed / Cancelled service-owned workflow.
- Target date and ordering.
- Archive / Restore only.

### Tasks
- Create and edit inside a Client Project.
- Optional Milestone relation, restricted to the same project.
- To Do / In Progress / Blocked / Done / Cancelled workflow.
- Low / Normal / High / Urgent priority.
- Start and due dates.
- Assignment only to active Project Members.
- Archive / Restore only.

### Progress
A project can use:
- `manual`: existing manual progress remains authoritative.
- `calculated`: Worker computes completion from eligible Tasks.

Archived and cancelled Tasks are excluded from the calculated denominator. Normal project edits cannot silently reset a calculated project back to manual mode.

## Client → Projects navigation
The Client detail drawer now includes the Client's internal projects near the top of the detail experience.

- Clicking a project card opens that exact Client Project workspace directly.
- `View all client projects` opens Client Projects scoped to that Client.
- The scoped view visibly shows the Client name/code and can be cleared back to all projects.
- Opening Client Projects from the main navigation always returns to the normal unscoped list.

This is backed by the Client detail API; it is not a browser-only association. The list API also supports `client_id` filtering server-side.

## Historical Client identity
Client codes are historical identities, not positional labels. The integration gate explicitly covers:

- create `CU-001`, `CU-002`, `CU-003`
- permanently delete the first two clean Clients
- surviving Client remains `CU-003`
- next Client becomes `CU-004`

No renumbering or code reuse is allowed.

## API additions
Under `/api/v1/admin/client-projects/:id`:

- `GET execution/summary`
- `POST execution/progress-mode`
- `GET milestones`
- `POST milestones`
- `POST milestones/:milestoneId/update`
- `POST milestones/:milestoneId/lifecycle`
- `GET tasks`
- `POST tasks`
- `POST tasks/:taskId/update`
- `POST tasks/:taskId/lifecycle`

All mutations retain Admin auth, same-origin and CSRF enforcement. No HTTP DELETE route is added.

## UX
- Milestones and Tasks live inside the existing Project drawer; no empty top-level module is added.
- Execution summary shows effective progress, task totals, completed/in-progress/blocked/overdue counts and next milestone.
- AR/EN, RTL/LTR, Dark/Light and responsive layout are retained.
- Primary blue CTA text/icons remain white.
- Archive decisions use the NEXORA themed confirmation dialog, not `window.confirm()`.
- Unsaved Project Execution form values and active execution tab are preserved across language switching.
- Toasts remain short user-facing results only.

## Out of scope
Tickets/SLA, Quotes, Invoices, Payments, Client Portal, private files, comments/chat, and time tracking remain future independent gates.
