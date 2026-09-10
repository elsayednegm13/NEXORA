# NEXORA — NX-OPS-4 / Client Project Portal + Support Foundation

## Goal

Build the foundation now so the Client Portal, testing feedback and future commercial modules can grow without redesigning the Client Project domain later.

## Admin Project Workspace

Two reusable workspace modules are added through the NEXORA module registry:

- **Tickets** — create, update, assign, transition, communicate, archive/restore and inspect client/internal history.
- **Client Access** — generate, copy, regenerate and revoke secure project-tracking links for an active Client Contact.

Task and Milestone editors also gain an explicit **Visible to client** control. Existing records remain hidden by default.

## Secure project access

Flow:

1. Admin generates access for an active contact on an active Client Project.
2. Worker creates a random 256-bit raw token.
3. D1 stores only SHA-256 token hash.
4. Raw token is returned once as `/project-portal.html#token=...`.
5. Browser exchanges the fragment token through a same-origin endpoint.
6. Worker creates a random session and CSRF token; D1 stores only their hashes.
7. Raw access token is removed from the browser URL with `history.replaceState`.
8. Portal continues with an HttpOnly, Secure, SameSite=Strict session cookie.

Regenerating an access link for the same project/contact revokes the previous active grant and its sessions. Revoking the link, deactivating the Client, or archiving the Client Project also revokes sessions. Restore does not silently reactivate old access.

## Client-safe Project Portal

The portal intentionally uses the same NEXORA brand foundation but a calmer client-facing layout.

Client DTO is deny-by-default and exposes only approved project information:

- Project identity/status/dates
- Progress when permission allows it
- Explicitly client-visible Milestones
- Explicitly client-visible Tasks
- Project Tickets and client-visible conversation/history

It does not expose internal Admin IDs, audit records, agreed internal amounts or internal ticket notes.

## Ticket workflow

Types:

- Bug
- Issue
- Change Request
- Feedback
- Question
- Support Request

Statuses:

`new → under_review / in_progress → waiting_client / resolved → closed`

Additional service-authoritative transitions support reopen, reject and cancel paths. The browser does not define transition authority.

Priorities: `low`, `normal`, `high`, `urgent`.

Client-created tickets are always:

- bound to the current project/client grant
- created as `new`
- initially unassigned
- assigned only later by Admin to an active Project Member.

## Conversation visibility

Admin messages may be `client` or `internal`.

Client messages are always `client` visibility regardless of any forged browser payload. Portal queries filter messages/events to client-visible records only.

## Extensible NEXORA Design System

NX-OPS-4 introduces reusable foundations rather than module-local visual hardcoding:

- NEXORA design tokens (`nexora-foundation.css`)
- Project Workspace module registry
- reusable ticket status/priority visual registry
- Font Awesome 7.3.1 icon standard
- shared visual semantics for success/progress/warning/danger/muted states

The Portal consumes the same foundation while keeping a simpler client-facing information density.

## Deferred scope

This gate deliberately does not introduce:

- Quotes / approvals
- Invoices / Payments
- Billing authority
- File uploads
- SLA automation
- Email-to-ticket
- Knowledge Base
- Full account/password Client Portal identity

Those can be added later on top of the access/session/ticket foundation without replacing it.
