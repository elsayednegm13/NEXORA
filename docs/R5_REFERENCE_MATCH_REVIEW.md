# R5 approved-reference implementation — visual review pending

The owner approved `NEXORA_R5_SUPPORT_WORKSPACE_DESIGN_PROTOTYPE.html` and rejected the subsequent R5.1 interpretation. This change brings the actual Admin Project Support markup and styling back to that reference.

Base: `elsayednegm13/NEXORA@d4b11c9dea3227571a79d21aa7f87e62dee9c2be` (the uploaded R4.2 source).

## Changes

- Remove the rejected R4.2 density overrides from `admin.css`, retaining its composer width and shrinkable grid containment fixes.
- Load a dedicated `r5-reference.css`, scoped to the existing Project Workspace.
- Combine project identity, client/date/progress and module navigation in one context row.
- Integrate status, priority and assignee controls into the conversation header; use flat ticket rows and a unified composer.
- Match the reference's navy/cyan palette, dimensions and scrollbar styling. Preserve mobile list/detail navigation, mobile message visibility and existing actions.
- Preserve the exact original reference and document the protected decisions in the Design Contract draft.

There are five runtime files in this change: the existing Admin CSS, HTML and two project UI modules, plus the new scoped CSS. Backend, API handlers, migrations, Client Portal and realtime logic remain unchanged. The reference uses percentage tracks that overflow when combined with its gap; the implementation subtracts the gap before splitting usable width 31/69.

This is the Support reference checkpoint. It does not claim completion of the whole Admin design system. Dark Arabic desktop has the supplied visual reference; Light, English and mobile adaptations still require visual review.

## Validation

Executed against this repository candidate:

| Check | Result |
| --- | --- |
| Reference source checks | PASS — 26 mapped declarations, 268 protected existing files, 6 behavior guards |
| NX-COLLAB UI contract | PASS |
| NX-COLLAB Worker integration | PASS |
| Worker parity | PASS — 21/21 |
| Existing authenticated Admin compatibility | PASS — 10/10 |
| Changed JavaScript syntax / diff whitespace | PASS |
| Real-browser visual and interaction comparison | NOT RUN — cloud browser URL policy blocked the preview |

No screenshots, pixel match or visual acceptance are claimed. The original R4 release manifests and release scripts are retained as historical files; their preflight results do not certify this modified R5 candidate. No deployment was performed.

## Local visual review

From the repository root, with Node installed:

```powershell
node .\tests\r5-reference\server.mjs
```

Open `http://localhost:4173/` in your browser. Switch between **Implementation**, **Approved reference** and **Both**. The implementation uses the actual frontend modules with in-memory fixture data; it does not connect to production data. Theme/language controls apply to the implementation; the preserved reference remains its original dark Arabic design.

Review 1440×900, 1366×768, 1280×720, 1024×768, 768×1024, 390×844 and 360×800. Check the normal, long-message, empty and closed cases, including list/detail back navigation, editing controls, message visibility, composer containment and scrolling. The fixture supports basic ticket operations, not file upload or actual realtime transport proof.

For the source protection check:

```powershell
node .\tests\r5-reference\verify-source.mjs
```

Final visual approval and any release/deployment are separate next steps. The Design Contract remains DRAFT until the integrated result is approved.
