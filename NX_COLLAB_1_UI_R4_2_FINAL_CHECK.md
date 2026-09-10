# NEXORA NX-COLLAB-1 UI R4.2 — Final Check

Status: `FINAL LOCAL + COLD PACKAGE GATES PASS`

Baseline: live NX-COLLAB-1 UI R4.1.

Baseline Worker Version: `6045e875-1e0c-449a-b951-48f63ba412d5`.

Baseline Deployment ID: `2a4bc8aa-db0c-4b02-be88-d75f7641aab9`.

## Approved runtime delta

- `public/admin/css/admin.css`

## Approved test/release-tooling delta

- strengthen the R4.1 long-message stress fixture so tall viewports still prove internal thread scrolling;
- normalize only volatile rate-limit wall-clock timestamps in the existing Admin compatibility test;
- add the R4.2 real-DOM density browser fixture/gate;
- add R4.2 release/check/runner tooling and R4.1 baseline hashes.

## Locked invariants

- migrations remain exactly `0001..0010`;
- `0010_client_project_collaboration.sql` remains byte-identical to R4.1;
- no D1/R2/Secret/resource mutation is part of this release;
- no API-route inventory change;
- no HTTP DELETE route;
- no realtime/Files/Client Access business-logic change;
- Client Portal IA remains unchanged from R4;
- R4.1 message/composer containment remains mandatory;
- density is achieved using component dimensions, never browser zoom or CSS scale.

## Final acceptance focus

At 100% browser zoom, the Admin Client Project Workspace must feel compact and operational: project chrome uses substantially less vertical space, the ticket thread gets the majority of the available working area, and the composer remains fully visible and horizontally contained on desktop, tablet and mobile.


## Gate evidence

- Full engineering/regression gate: PASS.
- Existing Admin compatibility: PASS on four consecutive runs after volatile wall-clock normalization.
- R4 browser architecture regression: PASS.
- R4.1 real-DOM long-message containment regression: PASS.
- R4.2 real-DOM compact-density gate: PASS at 1728x900, 1440x900, 1366x768, 1280x720, 1024x768, 768x1024, 390x844 and 360x800.
- Cold-extracted manifest/hash verification: PASS.
- Cold-extracted R4.2 engineering/browser gate: PASS.

R4.2 remains code/assets-only. No live action is performed by the package until the owner explicitly runs the release runner with `-DeployRemote`.
