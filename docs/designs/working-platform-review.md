# Working Platform design — Goldfish review record

Method: [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model)
(plugin `egm@egm` installed in Claude Code). The design was drafted with full
project context (Elephant), then reviewed by three fresh-context subagents using
EGM's own reviewer personas (`agents/design_critic.md`,
`agents/implementation_readiness.md`, `agents/zoom_out.md`). Each reviewer saw
only the document and the source files listed in its prompt. Findings were then
resolved by the author (the owner delegated design decisions for this phase).

Totals: 3 Blockers, 21 Major, 9 Nit (some overlap between reviewers).

| # | Finding (reviewer) | Severity | Resolution |
|---|---|---|---|
| 1 | Suppression guards incomplete: status could be set to another value, scope narrowed, `contactId`/`orgId` re-pointed, contacts deleted without copying keys; malformed rows could break every user's load (critic) | Blocker | Server enforces a full restriction state machine (see "Restriction guards") and runs the engine's own `validRow` checks on every incoming row. Each bypass has a test. |
| 2 | Undo of an opt-out deletes the new restriction row; "never delete" would break it (readiness) | Blocker | Undo stays. A restriction may be deleted or narrowed only by command `undo`, by the same user who last wrote it, within 15 minutes. Otherwise refused with a "lift it with a reason" message. Audited. |
| 3 | No request/response contracts for the server store (readiness) | Blocker | Contracts written in "API contracts". |
| 4 | Permission inferred from change shape is bypassable (all three) | Major | Every commit names its engine command. A server table maps command → minimum level; unknown commands need Manage. Structural backstops remain (meta writes, deletes of history only from deleting commands). Trust boundary stated explicitly. |
| 5 | Restore report does not count every dropped row; deleting old data on a count match risks loss (zoom-out, critic) | Blocker/Major | Email Kit shows a per-table reconciliation after restore (in backup / stored identical / kept newer / not stored) with a download of rows not stored. Migration guide says keep the final encrypted backups; never delete on counts alone. |
| 6 | No cut-over plan; several profiles create duplicates (critic) | Major | Migration guide adds freeze → final backup per profile → restore each → duplicate review → retain backups 90 days. |
| 7 | Shared use breaks single-user assumptions: actor typed by hand, automatic follow-ups drafted with whichever browser's sender details (zoom-out) | Major | Actor is the signed-in platform user (server-injected). Automatic reconcile still marks due/closes conversations but no longer composes drafts; the person who continues a due follow-up drafts it with their own details. Agency-wide task owner kept and documented. |
| 8 | `/state` read not atomic with revision (readiness) | Major | `/state` reads revision and all rows in one `db.batch()` (single transaction). |
| 9 | Client-side purge deletes other users' just-uploaded attachments (readiness, critic) | Major | Server deletes a file only when no committed `sources` row references it and it was uploaded by the requester or is over 24 h old. `eraseFiles` is Manage and applies the same reference check. |
| 10 | Snapshots uploaded by clients are untrusted, large to load, and erasure must clear them (all three) | Major | Server builds the daily snapshot from D1. List returns metadata only; data is fetched on demand. A commit that deletes contacts or conversations deletes all snapshots (original privacy behaviour kept). |
| 11 | Session expiry / revocation mid-session not handled in the client (readiness) | Major | 401/403 on load or commit sets `failed`, calls `onlost`, shows a sign-in link. |
| 12 | View/edit users see controls they cannot use (readiness) | Major | Controls are marked with `data-needs="edit|manage"` and hidden by access level; banner for View. |
| 13 | Packaging under-specified (placeholders, CSP meta conflict, nonce, TS types) (readiness) | Major | A Vite plugin assembles the page from `tools/email-kit/src` at build time; meta CSP removed; per-request nonce inserted on `<script` tags; header CSP set. |
| 14 | `/platform/owner` relies on unverified edge header stripping; dev identity gated on `NODE_ENV` (critic) | Major | Kept (same trust as existing `/admin`) but rate-limited and audited; first-admin creation only when no active admin. Built bundle checked for `NODE_ENV` replacement. Header stripping listed as an open deployment check. |
| 15 | Rate limit uses spoofable `x-forwarded-for`; per-email lockout (critic) | Major | Platform limiter uses `cf-connecting-ip` only. Per-email limit raised to 20/15 min; per-IP 10/15 min. Tokens are 32 random bytes. |
| 16 | Platform limits (CPU for PBKDF2, payload, D1 sizes) assumed (critic, zoom-out) | Major | Listed as Open Questions with how to check. Commit chunks capped at 500 KB per statement; payload cap 20 MB with a clear error. |
| 17 | Requirements without a design element: test safety, responsiveness, release gate (zoom-out) | Major | Added to Goals and Verification Plan. Release gate recorded as an owner decision. |
| 18 | Missing standard sections; status premature (zoom-out, critic, readiness) | Major | Added The Problem, Open Questions, Detailed Implementation Plan, Verification Plan. |
| 19 | `audit_events` cannot hold details; one audit row per commit floods the log (readiness, zoom-out) | Nit | Migration adds `audit_events.detail`. Only security-relevant commits are audited. |
| 20 | Two revision counters (`meta/rev` and server rev) (zoom-out, critic) | Nit | Server ignores the client's `meta/rev` row and synthesises it from `email_kit_state.rev`. |
| 21 | Invalid `IN json_each` SQL; 409 detection (critic, readiness) | Nit | Fixed in the plan and implementation. |
| 22 | Admin may reset another admin and impersonate (critic) | Nit | Accepted: admins can already grant themselves everything; resets are audited with actor. |

## Post-implementation security review

A second fresh-context reviewer examined the finished server code. It found 3
restriction-guard gaps (2 High, 1 Medium) and 4 Low issues. All were fixed
before merge; see `docs/verification/working-platform-2026-11-03.md`.
