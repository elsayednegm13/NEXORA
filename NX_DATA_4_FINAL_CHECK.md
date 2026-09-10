# NX-DATA-4 Final Engineering Check

**Gate:** LOCAL PASS — Remote apply not performed by this artifact build.

- Migration chain: `0001..0009`
- Accepted migrations `0001..0008`: byte-identical to the R6 Live baseline
- `0009_client_project_portal_support.sql`: forward-only / no destructive data mutation
- `client_visible`: deny-by-default on Tasks and Milestones
- Portal credential storage: hash-only
- New tables: access grants, portal sessions, tickets, ticket messages, ticket events
- Workflow catalogs: Worker/service-authoritative
- New tables start empty in clean schema proof
- Public Portfolio seed/domain preserved
- `PRAGMA foreign_key_check`: PASS in local SQLite/D1-compatible proof

Remote owner gate remains separate from code deployment.

## R2 Windows UTF-8 portability hardening

- `tests/nx-data-4/schema-proof.py` reads migration text explicitly as UTF-8.
- The NX-DATA-4 Python runner forces UTF-8 mode as defense in depth.
- NX-OPS-4 now fails packaging if any schema proof uses `Path.read_text()` without an explicit encoding.
- No migration, application API, Worker business logic, or public/Admin feature behavior changed in this R2 correction.

