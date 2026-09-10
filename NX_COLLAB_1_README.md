# NEXORA NX-COLLAB-1 R3 — Clean Release

Do not call `APPLY_NX_COLLAB_1.ps1` directly. Use the clean release runner so Node/Wrangler versions, file hashes, clean staging, PowerShell parser validation and the exact staged Cloudflare dry-run remain enforced.

## Current state

R2 fixed the Cloudflare Durable Object deployment entrypoint. Its next read-only preflight proved that the entrypoint and bindings compile, then a later D1 count request returned the transient Wrangler transport error `fetch failed`. No Worker deployment completed in that attempt.

R3 changes release tooling only: recognized transient D1 count-read failures are retried up to four times with bounded 2/4/8 second backoff. Non-transient SQL/schema/JSON validation failures still stop immediately.

## First command — read-only

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\RUN_NX_COLLAB_1_RELEASE.ps1
```

The expected state now is:

```text
PASS Wrangler deployment dry-run: Cloudflare entrypoint + Durable Object bindings compile
PRE-FLIGHT PASS - CODE GATE. 0010 is already applied and no migration is pending.
```

Do not run `-CreateR2Remote` or `-ApplyDataRemote`: the R2 bucket already exists and `0010` is already applied. After the read-only CODE GATE is reviewed, the only remaining remote action is:

```powershell
.\scripts\RUN_NX_COLLAB_1_RELEASE.ps1 -DeployRemote
```
