# R5.1 Admin Foundation — review checkpoint

This checkpoint applies the approved R5 composition language to the shared Admin shell and management pages. It is intentionally separate from the Project Support reference checkpoint.

## Scope

- 58px global Admin top bar and a quieter, single shell around the active view.
- Sidebar navigation with restrained active state and the same NEXORA semantic palette.
- Overview context, statistics and activity surfaces with clear priority and less decorative chrome.
- Search, filters and refresh/create actions grouped as one command area joined to its table.
- Client, inquiry and project tables kept as the dominant work surface.
- Portfolio and Services cards treated as entity rows with controlled spacing and metadata hierarchy.
- Detail drawers, login entry, Dark/Light semantics, RTL/LTR-safe spacing and NEXORA scrollbars.
- Responsive rules for tablet/mobile and reduced-motion preference.

No API, Worker, D1, R2, migration, authentication, portal or realtime code is changed. This stylesheet is scoped to `#appView`/`#detailDrawer`; the Project Workspace reference stylesheet remains isolated in its own checkpoint.

## Validation

```text
R5_ADMIN_FOUNDATION_SOURCE_PASS
BROWSER_VISUAL_ACCEPTANCE: NOT_RUN
```

The source guard verifies the shell geometry, command/data composition, responsive breakpoints, theme scrollbar rules and absence of zoom/scale workarounds. Real-browser screenshots and interaction review remain required before visual approval.

Run:

```powershell
node .\tests\r5-admin-foundation\verify-source.mjs
```

This branch is a review candidate only. Do not deploy or merge it into `main` before visual review.

