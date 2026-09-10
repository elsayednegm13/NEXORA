# NEXORA Admin Design Contract v1 — DRAFT

> Status: **DRAFT / NOT YET OWNER-APPROVED**  
> Track: **R5 — NEXORA Content Architecture & Product Identity**  
> Live baseline remains **R4.1** until a later owner-approved release.  
> This contract records design decisions that must become protected once the final R5 visual baseline is approved.

## 0. Reference-match correction — 2026-09-10

**Precedence:** this section supersedes conflicting numeric targets below. The owner accepted the named Support prototype and rejected the R5.1 visual interpretation. The target is matching that reference, not creating another design direction. Final integrated runtime acceptance remains **PENDING**.

- Reference: `NEXORA_R5_SUPPORT_WORKSPACE_DESIGN_PROTOTYPE.html`, recovered current version 1.
- Reference SHA-256: `522fe882f7cb503e422d449dcf1f691ceb2eb8623594d41f77c1b1b8fd0475d6`.
- Repository correction base: `elsayednegm13/NEXORA` commit `d4b11c9dea3227571a79d21aa7f87e62dee9c2be` (R4.2). The rejected R4.2 density block is removed; its composer width/grid containment remains. The three existing HTML/JS files receiving UI changes were verified byte-identical to the R4.1 Clean Full source. R5.1 screenshots remain a rejected candidate, not the implementation baseline.
- R5.1 screenshots are evidence of the rejected candidate, not a new source of truth.
- Do not broaden this correction to other Admin modules until the Support implementation has been compared visually with the reference.

| Reference property | Captured target |
| --- | --- |
| Desktop global bar | 58px |
| Desktop project context | 72px, with project identity, metrics, navigation on one row |
| Workspace inset | 12px top / 20px horizontal / 18px bottom |
| Support panes | 31% / 69% of usable track space; 12px gap; ticket minimum 300px |
| Project avatar / title | 40px square / 16px title |
| Module control | 32px high, 10px text, 8px radius |
| Ticket list | 7px inset; flat rows with 10px × 8px padding and separators |
| Conversation | title, realtime state and edit controls share the header |
| Messages | 14px × 16px thread inset; 10px gap; 28px avatar; 10px body / 1.62 line height |
| Composer | 9px × 10px outer inset; one contained row, 34px controls |
| Dark base / accent | `#06111a` / `#36cfff` and `#3988ff` |

The proportional tracks subtract the gap before splitting space. The prototype uses percentage tracks whose sum plus the gap exceeds the available inner width. Do not reproduce that overflow defect.

The prototype has no Light theme or working mobile list/detail navigation. Their implementation must preserve the approved hierarchy without removing operational controls. Status/priority/assignee are accessible through a mobile toggle; message visibility stays available on mobile. The existing More menu, localized status meanings, internal-note semantics, API behavior and real data must be preserved even where the static prototype omits them.

**Verification status:** source checks and existing focused behavior tests passed. Browser visual verification is **BLOCKED** by the cloud browser URL policy. No new screenshots or visual PASS are asserted. The original prototype is preserved byte-for-byte under `tests/r5-reference/approved-prototype.html`; only its legacy image path is resolved in the local review server.

## 1. Purpose

The NEXORA Admin must behave and read as one coherent operational product, not a stack of unrelated cards. The design must optimize for understanding, scanning, task completion, and reliable spatial hierarchy before decorative density reduction.

The governing hierarchy is:

**Global Shell → Page Context → Primary Workspace → Contextual Actions**

A screen is not considered organized merely because components are smaller. Space, grouping, hierarchy, scrolling, and action placement must communicate the work model clearly.

## 2. Protected product principles

1. **Organization before reduction.** Never use smaller text, global zoom, CSS scale, or arbitrary compression to compensate for weak content architecture.
2. **One dominant workspace.** Every operational screen has one primary content region. Secondary information must not visually compete with it.
3. **Related content stays together.** Context, status, filters, content, and actions should be grouped by task relationship rather than placed in separate decorative cards.
4. **Progressive disclosure.** Secondary metadata, advanced options, audit/history, destructive lifecycle actions, and infrequent controls appear on demand when possible.
5. **No card-for-everything UI.** Cards are used only when they communicate a real conceptual boundary. Borders and surfaces are not substitutes for hierarchy.
6. **Every occupied area has a purpose.** Decorative empty space must never push active work below the fold without a product reason.
7. **Stable behavior over visual experimentation.** A visual refactor must not alter existing business rules, API contracts, D1 data, R2 behavior, authentication, realtime rules, or authorization unless separately approved.
8. **No generic dashboard notes.** Only alerts that affect the current work should consume persistent dashboard space.

## 3. NEXORA visual identity

### 3.1 Visual language
- Foundation: navy / graphite operational surfaces.
- Accent: NEXORA cyan/blue used intentionally, not on every border.
- Typography: clear white/ink hierarchy with muted metadata.
- Depth: restrained. Prefer surface contrast and separators over heavy shadows.
- Glow: contextual and subtle; never used as the primary way to show hierarchy.
- Radius: a small controlled family, not a unique radius per component.
- Icons: Font Awesome 7.3.1, consistent optical sizing and placement.

### 3.2 Semantic states
Status must use **icon + text + semantic color**, never color alone.

Required semantic families:
- Success / completed / connected.
- Progress / active / realtime.
- Warning / waiting / attention.
- Danger / failed / destructive.
- Muted / archived / inactive.

Light theme warning treatments must remain pale and legible; bright yellow surfaces are prohibited.

## 4. Global Admin shell

### 4.1 Sidebar
- Navigation groups remain meaningful: overview, sales/clients, operations, website content.
- Active module is visible through a restrained NEXORA accent and surface treatment.
- Group labels are secondary and must not compete with module names.
- Bottom utility actions remain visually separated from work navigation.
- On mobile/tablet the sidebar becomes an intentional navigation mode, not a permanently compressed desktop rail.

### 4.2 Top bar
The top bar is global application chrome only. It may contain:
- Current location / page identity.
- Language.
- Theme.
- Admin identity.
- Mobile navigation trigger.

It must not become a second page hero.

### 4.3 Page context
Page context answers, with minimal scanning:
- Where am I?
- What am I managing?
- What is the current state?
- What is the primary action?

Context should merge naturally with the workspace rather than create another large isolated panel.

## 5. Operational workspace composition

### 5.1 List / table modules
For inquiries, clients, and client projects:
- Search, filters, current sync/state, and primary creation action form one command area.
- The command area and data surface read as one workspace.
- The table/list is the dominant area.
- Row actions appear where the row is scanned, not in unrelated toolbars.
- Empty/loading/error states occupy the data region, not a separate page card.

### 5.2 Portfolio / Services management
- Management grids must behave as one content surface.
- Cards are permitted because each project/service is an independent entity.
- Card density must prioritize title, state, ordering, and visibility; decorative metadata is secondary.
- Editing remains contextual via drawer/dedicated view as appropriate.

### 5.3 Drawers and forms
- Drawers are used for focused edit/detail flows, not as substitutes for full workspaces.
- Long forms are grouped by semantic sections, but section borders must be restrained.
- Sticky actions are allowed only when they improve task completion and do not obscure content.
- Native `window.confirm` / browser prompts are prohibited.

## 6. Client Project Workspace — protected architecture

The Client Project is a dedicated full workspace, not a narrow legacy drawer.

The visual hierarchy is:

**Project Context + Module Navigation → Active Project Workspace**

Primary modules:
- Overview.
- Execution.
- Tickets & Support.
- Files.
- Client Access (Admin only).

Secondary modules may be grouped under a controlled overflow/more mechanism.

The project context and navigation should be visually connected. A large standalone project hero is not required and must not consume working space without functional value.

## 7. Tickets & Support — protected architecture

Desktop target architecture:

**Ticket List (31%) | Conversation (69%) of usable space, with a 300px ticket minimum**

Rules:
- Ticket list, filters, and new-ticket action form one left-side work region.
- Conversation header, controls, messages, and composer form one right-side work region.
- The message thread is the dominant vertical area.
- Composer remains visible within the workspace and must never require browser zoom-out.
- Long message threads use local scroll.
- Messages must wrap safely without horizontal expansion.
- New Ticket uses side drawer on desktop and full-screen/intentional mobile flow.
- Closed ticket: client cannot send additional messages and must create a new ticket.
- Realtime changes are subtle; no toast spam.
- Own mutations update locally immediately after HTTP success; realtime is not required to make the sender perceive success.
- No forced scroll when the user is reading older messages.

## 8. Files — protected architecture

Files are a real project workspace, not oversized previews inside unrelated cards.

Architecture:
**Folder/context rail → File list → Contextual preview/details**

Rules:
- Preview appears when useful and can be dismissed/reduced.
- Images use contained preview, never uncontrolled intrinsic sizing.
- PDFs support inline preview/download.
- Audio uses a compact player.
- Rename/move are metadata operations; R2 object identity remains opaque.
- Client-visible/internal visibility remains explicit and security-enforced.

## 9. Client Access — protected architecture

Client Access exists in Admin only. It must never be shown as a Client Portal module.

Admin Client Access must communicate:
- Current access state.
- Link availability/state.
- Contact/scope.
- Generate/copy/revoke actions.
- Secondary history/security details only when needed.

Raw portal access tokens are not assumed to be recoverable after generation if only hashes are persisted.

## 10. Client Portal relationship

The Client Portal uses the same NEXORA design system but is calmer and lower-density than Admin. It is not a miniature Admin clone.

Client Portal top-level information architecture remains intentionally safe and limited. Internal notes, admin assignment metadata, audit/security metadata, hashes, and internal-only execution details must never leak through UI or client DTOs.

## 11. Scrolling contract

Scroll is part of product architecture.

- Prefer one logical scroll region per workspace.
- Avoid nested scrolling unless the task intrinsically needs it.
- Full-page scroll should not be used to compensate for an incorrectly sized application workspace.
- Ticket threads, long lists, file lists, and other dense operational regions may use local scrolling.
- All intentional scroll surfaces use the NEXORA scrollbar identity in both themes.
- Scrollbars must remain discoverable and accessible; decorative hiding is prohibited where scrolling is required.

## 12. Typography and hierarchy

Typography values will be frozen after final visual approval, but hierarchy is protected now:
- Page/context title.
- Module/workspace title.
- Content title/body.
- Metadata/labels.

The interface must not rely on extreme title size to establish hierarchy. Metadata is visually quieter but remains readable at 100% browser zoom.

## 13. Spacing and density

Exact token values remain **candidate values** until owner approval.

Protected rules:
- Use a consistent spacing rhythm.
- Reduce wasted chrome before reducing readable typography.
- Related controls have tighter proximity than unrelated groups.
- Workspace gutters are consistent across modules.
- A new feature cannot introduce its own unrelated spacing system.

## 14. Buttons, forms, and controls

- Primary CTA text is white.
- One clear primary action per local task context where possible.
- Secondary actions are visually quieter.
- Destructive actions never look primary.
- Inputs/selects/textareas share one component language.
- Focus states are visible in Dark and Light themes.
- Disabled/loading states remain distinguishable.
- Form controls must not overflow at supported breakpoints.

## 15. Dark / Light themes

Dark and Light are two tuned semantic themes, not a mechanical color inversion.

Both themes must preserve:
- Hierarchy.
- Contrast.
- State meaning.
- Border/surface separation.
- Focus visibility.
- NEXORA identity.

## 16. Arabic / English

- Arabic uses RTL and English uses LTR without layout breakage.
- Alignment and directional icon meaning must follow language direction where appropriate.
- Switching language must preserve active workspace, drafts, and meaningful scroll state where technically supported.
- No Arabic-refresh English flash regression.

## 17. Responsive information architecture

Responsive design is not desktop shrinking.

Required acceptance widths include at minimum:
- 1440.
- 1366.
- 1280.
- 1024.
- 768.
- 390.
- 360.

At narrow widths:
- Multi-pane workspaces switch to deliberate list/detail navigation.
- Primary actions remain reachable.
- No horizontal page overflow.
- No hidden primary module action that requires accidental horizontal scrolling.
- Mobile back/navigation is explicit where a pane replaces another pane.

## 18. Motion and realtime feedback

- Motion uses transform/opacity where possible.
- No scroll hijacking.
- Reduced-motion preferences are respected.
- Realtime indicators are small and contextual.
- Realtime must never visually reset the user's work unnecessarily.

## 19. Prohibited patterns

The following require explicit owner re-approval before introduction:
- Large decorative hero that pushes operational content down.
- Independent card around every content group.
- Browser zoom/scale as a layout fix.
- Generic/default-looking scrollbars on intentional NEXORA workspaces.
- Horizontal overflow at supported acceptance widths.
- Native confirm/prompt dialogs.
- Client Access in Client Portal.
- Admin-internal metadata in Client Portal.
- New arbitrary colors outside semantic/design tokens.
- A new feature changing a previously approved layout rule merely because implementation is easier.

## 20. Acceptance gate

A major Admin UI release is not accepted by static contract tests alone.

Before owner approval it must include real-browser evidence covering, as relevant:
- Geometry/containment at required widths.
- No page horizontal overflow.
- No clipped or hidden primary controls.
- Logical scroll regions and NEXORA scrollbar styling.
- Dark + Light.
- Arabic + English.
- Hover + focus + active + disabled states.
- Empty/loading/error states.
- Tables/forms/drawers/modals.
- Ticket long-message/composer containment.
- Files preview sizing.
- Mobile list/detail navigation.
- Realtime state preservation where applicable.

## 21. Change-control rule after approval

Once owner approval converts this file from DRAFT to APPROVED:

1. The approved R5 UI becomes the design baseline.
2. The baseline is hashed/protected in release tooling.
3. Future UI work reads this contract first.
4. A change that conflicts with a protected clause must stop at a Design Decision Gate.
5. The owner must explicitly approve the contract amendment before implementation.
6. Business behavior must never be changed merely to simplify the UI.

## 22. Items intentionally left open until final R5 visual approval

These are not frozen yet:
- Integrated runtime acceptance of the captured reference sizes.
- Any additional spacing values not specified by the accepted reference.
- Global Admin sidebar dimensions outside the accepted Support reference.
- Radius values for components absent from the accepted Support reference.
- Exact shadow/glow strengths.
- Typography for components absent from the accepted Support reference.
- Light-theme semantic tuning; the captured dark reference values are not open-ended.

These values will be frozen only after the final integrated Admin design is visually accepted by the owner.
