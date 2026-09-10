# NEXORA NX-OPS-2 — R5 Clean Release Gate

## Status

- NX-OPS-2 application/API/UI scope is unchanged from the accepted implementation.
- Migrations `0001..0007` remain byte-identical; R5 adds no migration.
- Portable Node.js `v22.23.2` and Wrangler `4.129.1` remain pinned and isolated from machine-wide Node/npm/npx.
- Release integrity, clean temporary staging, runtime-cache exclusion, and safe empty `foreign_key_check` parsing remain enforced.
- R5 removes the wide nine-term `UNION ALL` production-count query from the release path.
- Production and Client Project row counts are now read with nine explicit, read-only single-table `COUNT(*)` queries and normalized in PowerShell before/after deployment.
- A failed D1 count command now prints its actual Wrangler/D1 error instead of suppressing it.

## Root cause closed by R5

The R3 preflight reached D1 successfully but D1 rejected the combined nine-term compound SELECT with `too many terms in compound SELECT`. Direct read-only probes against each of the same nine tables all succeeded with exit code `0`, proving the schema/tables were healthy and the failure was only the gate query shape.

R5 removes dependency on compound-SELECT limits entirely rather than guessing or raising a limit. The exact same per-table snapshot function is used before and after the code-only Worker deployment.

## Gate

Run only:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\RUN_NX_OPS_2_RELEASE.ps1
```

After `PRE-FLIGHT PASS`, owner-approved deployment is:

```powershell
.\scripts\RUN_NX_OPS_2_RELEASE.ps1 -DeployRemote
```


## R5 response-shape hardening

The Live R4 preflight proved each D1 table count query succeeds independently, but Windows PowerShell interpreted Wrangler's valid JSON wrapper inconsistently. R5 removes PowerShell object-shape parsing from D1 count and foreign-key probes. A pinned-Node helper (`scripts/D1_JSON_GUARD.mjs`) parses the raw Wrangler JSON, requires exactly one non-negative integer `rows_count` for count probes, and treats an empty foreign-key result set as zero violations. On any parser mismatch, the raw response is printed and deployment remains blocked.
