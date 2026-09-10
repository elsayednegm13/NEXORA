# NEXORA NX-COLLAB-1 UI R4

R4 is the code-only browser-acceptance correction on top of the Live NX-COLLAB-1 R3 baseline.

It delivers the dedicated Admin Client Project Workspace, discoverable Admin Client Access link controls, corrected Client Portal information architecture, responsive Tickets/Files layouts, safer realtime UX, and deny-by-default client DTO hardening.

It does **not** add a D1 migration, create an R2 bucket, change Secrets, reset data, or seed business rows. Migration `0010` and the Cloudflare realtime/files foundation are retained byte-for-byte/config-for-config where applicable.

## Read-only preflight

Extract this clean release into a new folder, then run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\RUN_NX_COLLAB_1_UI_R4_RELEASE.ps1
```

Expected final state before deployment:

```text
PRE-FLIGHT PASS - R4 CODE GATE.
```

The runner also performs an exact staged Wrangler `deploy --dry-run` before any remote action.

Do **not** run the next command until the preflight output has been reviewed:

```powershell
.\scripts\RUN_NX_COLLAB_1_UI_R4_RELEASE.ps1 -DeployRemote
```

## Acceptance after deployment

Final closure still requires a real Live browser pass: Admin full Project Workspace, visible Generate/Copy/Revoke client link workflow, Client Portal link exchange, two-browser realtime ticket/message/project updates, closed-ticket enforcement, R2 upload/preview/download, voice note, AR/EN, Dark/Light, and desktop/tablet/mobile layouts.
