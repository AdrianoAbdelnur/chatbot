# Proposal: Retrasados Operator Board

## Intent

Today the offline-vehicle pipeline sends WhatsApp templates to GPS client companies with **no human in the loop**: `app/api/cron/offline-vehicles/route.ts` (daily, 09:00 ART) calls `runOfflineMonitoringDailyJob()`, which runs an unconditional `dispatch({ send: true })` at `lib/offline-monitoring/daily-job.ts:18`.

A delayed report is not proof of a fault. The vehicle may be stopped, in the workshop, already under technical review, or the customer may be in debt. An automated query in those cases has **real commercial cost**: it annoys the client company, burns template quota, and erodes trust in the alerts we do send.

This change introduces a human gate: an operator worksheet ("planilla de retrasados") where a person reviews each delayed vehicle, records operational state and comments, can re-check a vehicle on demand, and **must explicitly authorize** before any WhatsApp query leaves the system.

## Current vs desired

| Aspect | Today | After this change |
|---|---|---|
| Dispatch trigger | Automatic, daily cron | Explicit per-row operator authorization |
| Human review | None | Worksheet with status, comment, review date, operator |
| Re-check a vehicle | Only via full daily scan | On-demand, single plate |
| Traceability | Notification docs only | Append-only audit event per operator action |
| Unauthorized incident | Sent | **Never** sent |

## Scope

### In Scope

- Per-row **authorization gate**: an incident with no explicit authorization is never dispatched.
- **Immediate dispatch on authorize**, grouped by company over already-authorized rows only, honouring the existing 10-vehicle batch cap (`MAX_VEHICLES_PER_OFFLINE_NOTIFICATION`).
- New **operator-owned fields** on the incident: operational status, comment, review date, reviewing operator.
- **Fixed operational-status vocabulary** as a TypeScript union, validated server-side.
- **Append-only audit trail** (new collection) for every operator action: status change, comment edit, re-check, authorization.
- **On-demand re-check** of a single plate, reusing Cybermapa + existing reconciliation.
- **Operator directory**: name-only reference list (no credentials) powering an attribution selector.
- **Worksheet UI** at a new route plus its supporting API routes.
- Cron becomes scan + dispatch-of-authorized-only (in practice a no-op for unreviewed vehicles).

### Out of Scope (non-goals)

- Application login, sessions, passwords, roles, or `proxy.ts` auth. **None.**
- Admin UI or DB-driven configuration for the status vocabulary — adding a value is a code change plus deploy.
- Richer telemetry columns (position, speed, event code) — `getCurrentCybermapaVehicleStatus` stays unused here.
- Any change to scanner detection, thresholds, or automatic resolve-on-reporting-again logic.
- Any change to the notification idempotency/reservation/retry engine (`notification-store.ts`).
- Repurposing `incident.status` or its dead `"acknowledged"` member.
- Restricting external access to the board (see Risks — this is an ops task, not code).

## Capabilities

> `openspec/specs/` is currently empty (only `.gitkeep`), so every capability below is new.

### New Capabilities

- `offline-incident-review`: operator-owned operational status, comment, review date and operator attribution on delayed-vehicle incidents; ownership boundary against scanner-owned fields.
- `offline-notification-authorization`: explicit per-row authorization as a precondition for dispatch; company-grouped immediate send; cron behaviour change.
- `offline-incident-audit-trail`: append-only operator event log.
- `offline-vehicle-recheck`: on-demand single-plate re-check and reconciliation.
- `operator-directory`: credential-free operator reference list used for attribution.
- `retrasados-operator-board`: worksheet surface (columns, states, actions) and its API contracts.

### Modified Capabilities

- None. No spec files exist yet; the daily-job behaviour change is captured inside `offline-notification-authorization`.

## Approach

1. **Gate at the eligibility query.** Add `authorizedAt` / `authorizedBy` to the incident document and require `authorizedAt: { $exists: true }` inside `listUnnotifiedActiveOfflineIncidents()` (`lib/offline-monitoring/incident-store.ts:65-68`). This is the single choke point every dispatch path already flows through. Reservation, idempotency hashing, retry and release logic stay byte-identical.
2. **Keep operator state separate from system state.** New fields (`operationalStatus`, `operatorComment`, `reviewedAt`, `reviewedBy`) live alongside — never on top of — `status` and `active`, which remain solely owned by the scanner. `"acknowledged"` stays dead code and MUST NOT be repurposed; overloading it would couple operator intent to automatic reconciliation.
3. **Fixed vocabulary in code.** A TypeScript union covering stopped/workshop, technical review, consulted/pending answer, reporting again, and exceptions such as customer debt, validated server-side on write. Colours are presentation-only; the persisted value is always the semantic status name.
4. **Append-only audit.** A new collection stores one immutable event per operator action (incident id, action, before/after where relevant, operator, timestamp). The worksheet renders current state; the collection answers "who decided what, when".
5. **Immediate, company-scoped dispatch.** The authorize route stamps the selected rows, then calls `runOfflineNotificationDispatch({ send: true }, ...)` with a scoped `listIncidents` dependency (the module already accepts a full dependency override) so only that company's authorized rows are planned. The operator gets synchronous feedback. Batching, contact resolution and the deterministic reservation `_id` are untouched.
6. **Re-check by reusing what exists.** `getCybermapaVehicleReports([plate])` already accepts a single-plate array; wrap it with the existing normalizers and feed the single observation to `reconcileOfflineIncidents`. No new Cybermapa integration.
7. **UI and routes follow current conventions**: `app/api/...` route handlers returning `Response.json({ success, error? })`, manual `typeof` body validation, `runtime = "nodejs"`, `dynamic = "force-dynamic"`, client component with Tailwind. All Cybermapa, Mongo, Meta credentials stay server-side.

## Proposal question round — assumptions needing confirmation

These are **assumptions**, not settled decisions. Confirm or correct before specs.

| # | Assumption | Why it matters |
|---|---|---|
| 1 | **Operator attribution without login**: a small name-only reference collection (no credentials) surfaced as a selector; the chosen operator id/name is stamped on every audit event. | It is the cheapest controlled vocabulary and the cleanest seam: a real user/auth table can replace the list later without touching the incident or audit schema. |
| 2 | **External access restriction is an operations concern, not code in this change** (Vercel deployment protection or IP allowlist). | Stated plainly: until access is restricted externally, the board **and its mutating routes are publicly reachable**. Anyone with the URL could authorize a WhatsApp send. This is a real, accepted, temporary risk — not a detail to gloss over. |
| 3 | **Colour is presentation-only**; the database stores the semantic status name. | Prevents a UI palette change from becoming a data migration. |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `lib/offline-monitoring/incident-store.ts` | Modified | Authorization + operator fields on the document; `listUnnotifiedActiveOfflineIncidents()` requires `authorizedAt`; new indexes for board queries. |
| `lib/offline-monitoring/daily-job.ts` | Modified | Keeps `dispatch({ send: true })`, which now only picks up authorized rows (self-heals retryable failures). Behaviour change: **no unreviewed vehicle is ever messaged**. |
| `lib/offline-monitoring/types.ts` | Modified | Operational-status union, operator/audit types. |
| `lib/offline-monitoring/notification-service.ts` | Modified (minimal) | Accepts a scoped incident source for operator-triggered dispatch. |
| `lib/offline-monitoring/notification-store.ts`, `notification-planner.ts`, `scanner.ts` | Unchanged | Idempotency, batching and detection logic are explicitly untouched. |
| New `lib/offline-monitoring/` modules | New | Operator review store, audit-event store, operator directory, single-plate re-check. |
| New `app/api/...` routes | New | List board rows, update status/comment, re-check, authorize + dispatch. |
| New board page under `app/` | New | Worksheet UI. |
| `scripts/notify-offline-vehicles.ts` | Behaviour change, no edit | `npm run offline:notify` keeps working but now previews/sends **only authorized** incidents. It stops being a way to blanket-message every delayed vehicle. Document this. |
| `scripts/check-offline-vehicles.ts` | Unchanged | Scan-only; detection is untouched. |
| `app/api/cron/offline-vehicles/route.ts`, `vercel.json` | Unchanged | Same schedule, same `CRON_SECRET` guard. |

## Backward Compatibility and Migration

- **No data migration.** Existing `gps_offline_incidents` documents have no operator fields. Because the gate is `authorizedAt: { $exists: true }`, an absent field means **not authorized**, so every pre-existing incident is safe by construction.
- Pre-existing incidents appear on the board as **un-reviewed and un-authorized**. They are never authorized by default. **An incident with no explicit authorization MUST NEVER be dispatched.**
- Incidents already stamped with `initialNotificationId` remain excluded, exactly as today — no duplicate messages for already-notified vehicles.
- Existing route contracts are unchanged; all new surface is additive.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Board and mutating routes publicly reachable** until access is restricted externally — an outsider could trigger a real WhatsApp send. | High | Accepted, temporary, and recorded here. Restrict via Vercel deployment protection or IP allowlist **before** real operational use. Escalate if the board goes live unprotected. |
| **Multiple messages to the same company** when rows are authorized one at a time (immediate dispatch is a settled decision). | Medium | Zero-cost mitigation only: let the operator multi-select rows and authorize them in one action. No batching window, no deferred queue. |
| Operator authorizes based on stale data. | Medium | The re-check action refreshes a single plate on demand before authorizing. |
| Operator attribution is unverified (no login). | High | Explicitly accepted for now. Audit events are still recorded and the field shape survives a future real auth table. |
| Silent regression: dispatch stops working because the gate is too strict. | Low | Board surfaces a per-row WhatsApp-query state including "not authorized"; strict TDD covers gate-passes and gate-blocks. |
| Operator status drifting into scanner-owned `status`/`active`. | Low | Separate fields, separate owners, asserted in tests. `"acknowledged"` stays unused. |

## First Slice (smallest shippable increment)

Read-only board + the gate. Concretely: add the authorization fields, tighten `listUnnotifiedActiveOfflineIncidents()`, and ship a worksheet that **lists** delayed vehicles with their derived age and WhatsApp-query state. Result after slice one: automatic sending is stopped and nothing can be dispatched without explicit authorization, even before any write action exists. Review/comment/audit, authorization + immediate dispatch, and on-demand re-check follow as later slices.

## Verification

- **Strict TDD** (`openspec/config.yaml` → `strict_tdd: true`): `npm test` (`node --test --experimental-strip-types tests/*.test.mjs`), `node:assert/strict`, plain-object dependency fakes — **no mocking library**, fixed `NOW` fixtures, flat sentence-style test titles.
- `npm run lint` and `npm run build` before declaring done.
- Behavioural assertions that matter most: an unauthorized incident is never planned; an authorized incident is planned exactly once; re-authorizing does not duplicate a send (existing reservation hash); pre-existing incidents without operator fields are treated as unauthorized.
- No secret ever reaches the browser; a Meta-accepted send is reported as *accepted*, never as *delivered*.

## Rollback Plan

1. Revert the `authorizedAt` predicate in `listUnnotifiedActiveOfflineIncidents()` — the pipeline instantly returns to today's fully automatic behaviour.
2. Remove the board page and its API routes; the cron path does not depend on them.
3. New fields and the audit collection can be left in place: they are additive and ignored by the scanner and the notification engine. No destructive migration is required in either direction.

## Dependencies

- Cybermapa `DATOSACTUALES` availability for on-demand re-check (already used by the scanner).
- Externally configured access restriction (Vercel/IP) before real operational use — **outside this repository**.

## Success Criteria

- [ ] No WhatsApp template is ever sent for an incident lacking explicit operator authorization.
- [ ] Every delayed vehicle appears on the worksheet with system, company, plate, last report + derived age, operational status, comment, review date, operator, and WhatsApp-query state.
- [ ] Authorizing rows dispatches immediately for that company and the operator sees the outcome without waiting for the cron.
- [ ] Every operator action is recoverable from the audit collection.
- [ ] Scanner detection, incident reconciliation and notification idempotency behave exactly as before (existing tests untouched and green).
- [ ] `npm test`, `npm run lint` and `npm run build` pass.
