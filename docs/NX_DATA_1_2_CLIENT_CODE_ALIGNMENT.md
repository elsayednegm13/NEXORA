# NEXORA NX-DATA-1.2 — Client Code Alignment

## Owner-approved rule

The Client Code number is the real `clients.id`, rendered with a minimum width of three digits:

```text
id=1     -> CU-001
id=2     -> CU-002
id=9     -> CU-009
id=99    -> CU-099
id=999   -> CU-999
id=1000  -> CU-1000
id=1001  -> CU-1001
```

`003`-style padding is a minimum display width, never a maximum. There is no artificial upper limit.

## Why 0006 exists

`0005_clients_hardening.sql` was already applied to the live D1 before the owner clarified that `CU-000` was only an example and numbering must start at one. Applied migrations are immutable. Therefore the correction is forward-only:

```text
0005_clients_hardening.sql       immutable historical migration
0006_clients_code_alignment.sql  owner-approved correction
```

The old draft `0005_client_projects.sql` remains superseded and must never be applied. Client Projects move to a later migration number (`0007` at the earliest, subject to the next accepted architecture gate).

## Migration behavior

`0006_clients_code_alignment.sql` performs only two writes, both scoped to `clients.client_code`:

1. set committed Client Codes to `NULL` to avoid UNIQUE collisions;
2. set each code to `CU-` + `printf('%03d', id)`.

It does not modify IDs, public IDs, statuses, contacts, inquiries, services, Portfolio projects, audit records, tokens, or public content. It does not reset `sqlite_sequence`.

## Identity/no-reuse rule

Client `id` remains `INTEGER PRIMARY KEY AUTOINCREMENT`. A hard-deleted Client creates a permanent hole. The next Client receives the next database ID and therefore the next code. Example:

```text
id=1  CU-001
id=2  CU-002   <- eligible clean client deleted
id=3  CU-003   <- next client; CU-002 is never reused
```

## Runtime alignment

NX-OPS-1.1A R1 uses the same server-authoritative formula:

```sql
'CU-' || printf('%03d', id)
```

Browser payloads cannot choose or edit Client Code. Inquiry -> new Client conversion uses the same allocator.

## Gate order

```text
NX-DATA-1.2 local proof
        ↓
NX-DATA-1.2 live 0006 apply
        ↓
NX-OPS-1.1A R1 runtime deploy
        ↓
Real-browser acceptance
        ↓
NX-OPS-1.1B Secure Client Profile Completion
```

Do not start Client Projects during this correction gate.
