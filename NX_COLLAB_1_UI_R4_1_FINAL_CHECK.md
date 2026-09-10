# NX-COLLAB-1 UI R4.1 — Final Check

Status: **LOCAL/COLD RELEASE GATES PASS — READY FOR OWNER READ-ONLY PREFLIGHT**

Approved runtime change surface: `public/admin/css/admin.css` only.

## Root-cause proof

The new real-DOM containment gate was executed against the deployed R4 package before applying the CSS correction. It failed at every tested size because `#projectSupportRoot` did not fill the Project Workspace content track, the support/detail/composer escaped the visible workspace, and the long thread did not become the local scroll owner.

## Correction proof

After the R4.1 CSS containment correction, the dedicated browser gate passes at:
- 1728x768
- 1440x900
- 1440x720
- 1280x800
- 1024x768
- 768x1024
- 390x844
- 360x800

The stress fixture reproduces the real `#projectSupportRoot` wrapper, a long multi-line ticket message, and an expanded reply textarea. It verifies that the message thread scrolls internally, the reply composer remains fully inside the ticket detail and viewport, the thread never overlaps the composer, and mobile retains usable thread height at 100% zoom.

## No-regression proof

- R4 Live baseline protected outside `public/admin/css/admin.css`.
- Migration inventory remains 0001..0010; 0010 byte-identical.
- API route inventory remains 89; no HTTP DELETE route.
- Existing R4 browser architecture gate PASS.
- NX-DATA-5 schema proof PASS.
- NX-COLLAB full schema regression PASS.
- NX-OPS-4 / NX-COLLAB Worker integration PASS.
- Worker parity 21/21 PASS.
- Existing authenticated Admin compatibility 10/10 PASS.
- New R4.1 browser containment gate PASS.

## Remote policy

R4.1 is code/assets only. The release runner must be executed without `-DeployRemote` first. The preflight must prove existing D1 identity, no pending migration, existing private R2 bucket, FK integrity, current production counts, runtime health, and Wrangler dry-run before owner approval of deployment.
