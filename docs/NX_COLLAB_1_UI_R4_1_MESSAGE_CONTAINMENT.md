# NEXORA NX-COLLAB-1 UI R4.1 — Message/Composer Containment Correction

## Scope

Code/assets only. This correction is intentionally limited to Admin Project Workspace layout containment. No API, Worker business logic, D1 schema, migration, R2, Durable Object, permissions, ticket workflow, or Client Portal behavior is changed.

## Root cause

R4's browser fixture placed `.admin-support-workspace` directly inside `.project-support-section`. The real Admin DOM has an additional `#projectSupportRoot` wrapper. That wrapper had no explicit `height/min-height/max-height` containment. As ticket/thread content grew, the percentage-height workspace could resolve against content instead of the fixed remaining workspace track. The outer project module clipped the overflow, which pushed the reply composer below the visible viewport. Zooming out only masked the geometry error.

## Correction

- Make Project Support/Files/Access modules explicitly fill the remaining Project Workspace track.
- Make `#projectSupportRoot`, `#projectFilesRoot`, and `#projectAccessRoot` explicit 100% height/min-height:0 containment boundaries.
- Keep ticket detail shell bounded to its parent and overflow-hidden.
- Keep message history scrollable locally with `min-height:0` and `overflow-y:auto`.
- Keep message bubbles width-contained with defensive wrapping.
- Keep composer and textarea within the detail viewport.
- Compact controls/composer on <=430px so the message thread retains usable vertical space.

## Permanent gate lesson

Visual fixtures must reproduce the real runtime wrapper hierarchy. R4.1 adds a dedicated Chrome/Edge/Chromium geometry stress gate using the actual `#projectSupportRoot` hierarchy, a multi-line long message, and an expanded reply textarea at 1440, 1280, 1024, 768, 390, and 360 widths. It fails if the root/workspace escapes its track, the composer leaves the ticket detail, the thread overlaps the composer, the page itself scrolls, or the mobile thread collapses below a usable height.
