# NEXORA NX-OPS-3 — R5 Font Awesome + Execution Visual Board Final Engineering Check

Status: **LOCAL PASS CANDIDATE / REMOTE NOT STARTED**

## Scope

R5 is a code/assets-only visual refinement on top of the accepted NX-OPS-3 R4 baseline. It does not add a migration, API route, workflow status, D1 table, Portal capability, Billing capability, or destructive operation.

## Admin icon standard

- Font Awesome Free 7.3.1 is pinned for the Admin UI.
- `public/admin/js/core/icons.js` is the single shared helper for dynamic Admin icons.
- Admin shell/navigation/search/actions and current Admin modules use Font Awesome icons with readable fallback glyphs.
- Public Website and Client Profile are intentionally left byte-identical to avoid an unrelated visual rewrite.
- Dark/Light and RTL/LTR remain supported.

## Project Execution visual baseline

- Existing summary/progress behavior is unchanged; summary cards now use consistent semantic Font Awesome icons.
- Tasks stay grouped by their existing Milestone/Stage.
- Each stage shows completion progress plus a multi-status distribution strip and compact status counts.
- Existing tasks render as compact cards; suitable desktop widths use a two-column grid, responsive widths use one column.
- Opening a task expands the editor across the available grid width.
- Each task is identifiable by status rail/tint + icon + readable text:
  - Done/Completed: green.
  - In progress: blue.
  - Overdue: red.
  - Blocked: amber/orange.
  - To do/Pending: amber.
  - Cancelled: muted red/neutral.
  - Archived: muted.
- Overdue remains derived from existing due/target dates and does not mutate workflow state.
- Stage/task title and metadata font sizes are raised for clearer 100% zoom readability.
- New Task / New Milestone create panels still collapse after successful save and the refreshed item is shown in its correct stage.
- Task Assignee row-card behavior remains unchanged.
- Primary CTA white-text standard remains unchanged.

## Functional boundaries preserved

- `projects` remains Public Portfolio only.
- `client_projects` remains Internal Delivery.
- Task statuses remain `todo`, `in_progress`, `blocked`, `done`, `cancelled`.
- Milestone statuses remain `pending`, `in_progress`, `completed`, `cancelled`.
- Assignment remains limited to Project Members.
- Manual/Calculated progress rules are unchanged.
- No HTTP DELETE route is introduced.
- Migrations 0001..0008 remain byte-identical.
- Existing Client identity/no-reuse behavior remains unchanged, including the accepted CU-003 -> next CU-004 production rule.

## Required gates

- Exact NX-OPS-3 R4 deployed-baseline protection with only reviewed R5 files allowed to differ.
- Historical protected baseline regression.
- Public website / Client Profile 38/38 byte parity.
- Font Awesome Admin runtime/helper/UI contract.
- API inventory remains 61.
- NX-DATA-3 schema gate.
- Public Worker parity 21/21.
- Existing Admin compatibility 10/10.
- NX-OPS-1.1A / 1.1B regressions.
- NX-OPS-2 regression.
- NX-OPS-3 Worker integration.
- NX-OPS-3 UI contract including stage distribution, compact cards, assignee behavior and post-save collapse.
- JavaScript syntax / HTML duplicate IDs / CSS structure.
- Windows PowerShell critical-script ASCII check.
- Cold-extracted ZIP + SHA manifest verification.

## Remote state

No remote operation is performed by this engineering check. R5 requires the normal read-only CODE preflight before owner-approved deployment.


## R6 — Font Awesome Inquiry Detail Rendering Fix
- Fixed Inquiry detail cards rendering escaped `<i class=...>` markup as visible text.
- Root cause: `detailIcon(kind)` returned trusted static icon markup and was incorrectly passed to `esc()`.
- Content values remain escaped; only the controlled icon helper output is rendered as markup.
- Added project-wide regression gate rejecting `esc(faIcon(...))`, `esc(detailIcon(...))`, or `esc(executionStateIcon(...))`.
- No DB, API, workflow, migration, or public/client-profile change.
