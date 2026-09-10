# NX-COLLAB-1 UI R4.1

R4.1 is a code/assets-only containment correction for the Admin Project Workspace ticket conversation.

It fixes the confirmed Live case where growing message/thread content pushes the reply composer below the visible workspace, so the lower controls appear only after browser Zoom Out.

## Scope

Only `public/admin/css/admin.css` changes from the deployed R4 runtime. No Worker/API business logic, Client Portal runtime, migration, D1 schema, R2 behavior, Durable Object logic, permissions, or ticket workflow changes are included.

## Permanent regression protection

R4.1 adds a real-DOM browser stress gate that uses the same `#projectSupportRoot` wrapper hierarchy as production, a long ticket message, and an expanded reply textarea. It runs at wide/short desktop sizes as well as desktop/tablet/mobile sizes, including 1728x768 and 1440x720, so the exact class of vertical clipping cannot pass a fixture that omits the production wrapper again.

## Owner workflow

Use the release runner only:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\RUN_NX_COLLAB_1_UI_R4_1_RELEASE.ps1
```

Run without `-DeployRemote` first. Deploy only after owner review of a PASS preflight.
