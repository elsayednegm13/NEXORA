# NEXORA NX-COLLAB-1 UI R4.2 — Compact Density Pass

R4.2 is a code/assets-only Admin UI refinement over the live R4.1 baseline.

## Purpose

The Admin Client Project Workspace was functionally correct after R4/R4.1, but its visual density remained too low on normal laptop/desktop viewports. R4.2 reduces chrome height and padding while preserving readability, realtime behavior, private files, Client Access, AR/EN, Dark/Light, responsive behavior, and the R4.1 message/composer containment correction.

## Runtime scope

Only `public/admin/css/admin.css` changes at runtime.

There is no migration, D1 schema change, R2 resource change, Secret change, API-route change, Durable Object/realtime semantic change, or Client Portal IA change.

## Key UI changes

- Compact 58px Admin Project Workspace top bar on desktop.
- Compact project summary/hero with a fixed 102px desktop height.
- Compact module navigation and controls.
- Smaller ticket cards, status pills, headers and form chrome.
- More of the viewport is reserved for the ticket thread.
- Compact message bubbles, attachment cards and composer controls.
- Compact Files and Client Access workspaces.
- Mobile/tablet density tuned separately; no CSS `zoom` or `transform: scale()` workaround.
- Explicit shrinkable ticket-detail grid track prevents the mobile composer from widening beyond the ticket pane.

## Browser acceptance gates

R4.2 is tested at browser zoom 100% on:

- 1728x900
- 1440x900
- 1366x768
- 1280x720
- 1024x768
- 768x1024
- 390x844
- 360x800

The R4 and R4.1 browser gates are also retained as regressions.

## Owner workflow

Extract the Clean Full ZIP into a new folder and run the read-only preflight:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\RUN_NX_COLLAB_1_UI_R4_2_RELEASE.ps1
```

Do not deploy unless the run ends with:

```text
PRE-FLIGHT PASS - R4.2 CODE GATE.
```

After owner review only:

```powershell
.\scripts\RUN_NX_COLLAB_1_UI_R4_2_RELEASE.ps1 -DeployRemote
```
