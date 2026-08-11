# Tasks: Retrasados Operator Board

## Addendum — Phase 8: On-demand per-company scan (added 2026-08-05, beyond the original 7 slices)

Requested after slice 7 shipped, once the board showed only 16 delayed vehicles. Root cause was not a defect: only 3 companies are registered in `gps_company_contacts`, all with `vehicleSource: "manual"`, covering 87 hand-loaded plates. With no `platform` contact, `scanner.ts:191-196` never even calls `GETVEHICULOS`, so the rest of the fleet was never in scope.

- [x] 8.1 RED — `tests/offline-company-scan.test.mjs`: 11 tests for `listMonitoringCompanies` and `scanCompanyVehicles`.
- [x] 8.2 GREEN — `lib/offline-monitoring/company-scan-service.ts`: group `GETVEHICULOS` by normalized company key; scan one company's plates in batches of 100; reconcile only that company's observations.
- [x] 8.3 GREEN — `app/api/offline-board/companies/route.ts` (`GET`) and `app/api/offline-board/scan/route.ts` (`POST {operatorId, companyKey}`).
- [x] 8.4 GREEN — board UI: company selector, "Traer empresas" and "Escanear esta empresa", plus a scan result line.
- [x] 8.5 Verify — `npm test` (156/156), `npm run lint` (clean), `npm run build` (clean). Live: `GET /api/offline-board/companies` returns 796 companies / 4,763 vehicles in ~1.3s.

**Whole-platform scan is deliberately not offered** — one company per request, by explicit user decision, so the upstream call count stays bounded and the route stays inside its 60s budget.

**Company-name invariant resolved (the case design Decision 2 flagged as "flag, don't silently assume"):** a scanned company that has a contact keeps `contact.companyName`, so all incidents of that company share one spelling and dispatch scoping still matches exactly. Only a contactless company — which cannot be notified anyway — carries the raw platform name. Verified additionally that `notification-planner.ts:68` already matches incidents to contacts through `normalizeMonitoringCompanyName`, not the raw string, so a later-created contact still picks up existing incidents.



## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ≈ 2,000 (design's own single-pass estimate: ≈1,720; this per-route/type granularity runs slightly higher, same order of magnitude) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 7 slices, PR 1 → PR 7 (see Suggested Work Units) |
| Delivery strategy | ask-on-risk (default; not overridden for this run) |
| Chain strategy | pending — branch-targeting strategy (stacked-to-main vs feature-branch-chain) is a user decision deferred to apply time. Slice content/order below is strategy-independent. |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Likely PR | Est. lines | Depends on |
|---|---|---|---|---|
| 1 | Safety gate — stop all automatic dispatch | PR 1 | ~250 | none |
| 2 | Board read model (status vocab, row mapper, GET routes) | PR 2 | ~390 | PR 1 (types only) |
| 3 | Operator directory + audit trail (no behavior change) | PR 3 | ~190 | none (parallel-safe with PR 2) |
| 4 | Operator review write path (POST /review) | PR 4 | ~275 | PR 2, PR 3 |
| 5 | Authorization + company-scoped dispatch (POST /authorize) | PR 5 | ~330 | PR 1, PR 3 |
| 6 | On-demand recheck (POST /recheck) | PR 6 | ~270 | PR 2, PR 3 |
| 7 | Board UI — wires PR 2/4/5/6 into `/retrasados` (ships last) | PR 7 | ~310 | PR 2, 4, 5, 6 |

Dependency graph (linear happy path; PR 3 can run in parallel with PR 2 if the team prefers):

```
PR1 (gate) ─┬─► PR2 (board read) ─┬─► PR4 (review write) ─┐
            │                     │                        ├─► PR7 (UI, last)
            └─────────────────────┴─► PR3 (directory+audit)─┼─► PR5 (authorize)
                                                             └─► PR6 (recheck)
```

---

## Safety-Critical Ordering Rationale

PR 1 ships first and **alone** because it is the only unit that changes the running system's real behavior without any new surface: adding `authorizedAt: { $type: "string" }` to `buildDispatchEligibilityFilter()` and wiring it into `listUnnotifiedActiveOfflineIncidents()` makes every dispatch path (cron, `npm run offline:notify`, and the future authorize route) return zero eligible incidents until something writes `authorizedAt` — and nothing does until PR 5. This means:

- The safety property ("no WhatsApp send without explicit authorization") is live from PR 1, verifiable in isolation, and independently reviewable in minutes.
- PR 1 has **zero new writers** of the field it gates on — the closure is airtight the moment it merges, not "eventually" once the rest of the system exists.
- Every later PR only adds *ways to open* the gate (review, directory, authorize, recheck, UI) — never a new way to bypass it, because `buildDispatchEligibilityFilter` is the only builder of that Mongo filter and is not spreadable/overridable (Design Decision 1).
- **Operational note**: immediately after PR 1 merges and before PR 5, `npm run offline:notify` and the cron will preview/send **zero** incidents always (nothing can be authorized yet). This is expected and safe, not a regression — flag it to whoever runs the script during rollout.

PR 5 (authorization) is the second safety-relevant unit: it is the **only** PR that writes `authorizedAt`. It is sequenced after the read model (PR 2) and actor infrastructure (PR 3) so that by the time anything can open the gate, an operator can already see what they're authorizing and is validated against a real directory with an audit trail.

PR 7 (UI) ships **last** by explicit instruction: every backend route it consumes (PR 2, 4, 5, 6) is already merged, tested, lint-clean and build-clean, so UI risk never gates or masks a backend correctness question — the UI is a pure, replaceable consumer of already-proven contracts.

---

## Testing Convention Notes (read before Phase 1)

- **RED → GREEN → REFACTOR applies to pure functions and DI-seamed service functions** — the six files named in design's Testability table: `offline-dispatch-eligibility`, `offline-board-row`, `offline-operational-status`, `offline-operator-board-service`, `offline-authorization-service`, `offline-vehicle-recheck`.
- **Raw MongoDB CRUD wrapper modules get GREEN-only tasks** — `operator-directory-store.ts`, `incident-audit-store.ts`, and the read/write-plumbing halves of `incident-review-store.ts` have no pure logic and no dedicated test file, matching this repo's existing convention: `incident-store.ts` and `notification-store.ts` have **zero** direct test files today (verified via design's call-graph table: "Test consumers: none"). Their correctness is exercised indirectly through the DI-faked service tests that call them (e.g. `offline-operator-board-service.test.mjs` fakes `findOperator`/`applyReview`/`appendAudit`).
- Every new test file: `node:test` + `node:assert/strict`, flat `tests/*.test.mjs`, kebab-case named after the module, plain-object fakes from local factory functions, **no mocking library**, fixed `const NOW`, no `beforeEach`/`afterEach`, flat sentence-style `test("...", ...)` — exact idiom of `tests/offline-notification-service.test.mjs` and `tests/offline-monitoring-daily-job.test.mjs`.

## Forbidden Zone — Reservation / Idempotency Engine

`lib/offline-monitoring/notification-store.ts` (`reserveOfflineNotification`, `markOfflineNotificationAccepted`, `markOfflineNotificationFailed`) is **explicitly out of scope** for this entire change (design non-goal, confirmed in proposal). No task below touches it. If, during implementation, any task appears to require a change inside `notification-store.ts` — for example to "release" a reservation from the authorize route directly — **stop and flag it instead of implementing it**; re-read design Decision 1's rejected alternative ("Guard inside `reserveOfflineNotification`") for why this is rejected. `reserveOfflineNotification` must keep exactly one importer: `notification-service.ts`.

---

## Phase 1: Safety Gate (PR 1 — ships first, alone)

Spec: `offline-notification-authorization` → "Authorization Required Before Dispatch", "Pre-Existing Incidents Are Unauthorized By Default".

| Purpose | Files | Est. lines | Tests | Rollback boundary |
|---|---|---|---|---|
| Close every dispatch path in one predicate; stop automatic sending immediately | `types.ts`, `incident-store.ts`, `tests/offline-dispatch-eligibility.test.mjs` | ~250 (70 impl + 180 test) | `offline-dispatch-eligibility.test.mjs` — the gate's regression alarm | Revert 3 files; deletes one predicate line; instantly restores today's fully automatic behavior |

- [x] 1.1 RED — `tests/offline-dispatch-eligibility.test.mjs`: failing tests for `buildDispatchEligibilityFilter` (not yet exported from `incident-store.ts`): (a) no-scope call returns `{active:true, initialNotificationId:{$exists:false}, authorizedAt:{$type:"string"}}`, no `companyName` key; (b) `{companyName:"Acme"}` adds `companyName:"Acme"` to the same base filter; (c) `{}` behaves identically to no argument.
- [x] 1.2 GREEN — `types.ts`: add `export type DispatchScope = { companyName?: string }`.
- [x] 1.3 GREEN — `incident-store.ts`: implement `export function buildDispatchEligibilityFilter(scope: DispatchScope = {})` exactly per design Decision 1 (`$type: "string"`, not `$exists: true`).
- [x] 1.4 GREEN — `incident-store.ts`: change `listUnnotifiedActiveOfflineIncidents` to `(scope: DispatchScope = {})`, build its `.find()` filter via `buildDispatchEligibilityFilter(scope)`; add `authorizedAt?: string; authorizedBy?: { id: string; name: string }` to the private `OfflineIncidentDocument` type.
- [x] 1.5 REFACTOR — none required; confirm `notification-service.ts`'s zero-arg `dependencies.listIncidents()` call still type-checks against the widened optional-param signature.
- [x] 1.6 Verify — `npm test` (new test green; `tests/offline-notification-service.test.mjs` and `tests/offline-monitoring-daily-job.test.mjs` untouched and still green), `npm run lint`, `npm run build`.

---

## Phase 2: Board Read Model (PR 2)

Spec: `retrasados-operator-board` → "Worksheet Row Data Contract", "WhatsApp-Query State Vocabulary", "Default Scope Is Active Incidents".

| Purpose | Files | Est. lines | Tests | Rollback boundary |
|---|---|---|---|---|
| Operators can see delayed vehicles and derived WhatsApp-query state, read-only | `types.ts`, `operational-status.ts` (new), `board-row.ts` (new), `incident-review-store.ts` (new, read half), `operator-board-service.ts` (new, read half), `app/api/offline-board/incidents/route.ts` (new) | ~390 (270 impl + 120 test) | `offline-operational-status.test.mjs`, `offline-board-row.test.mjs` | Revert 6 files; no writes exist on this path yet, purely additive GET surface |

- [x] 2.1 RED — `tests/offline-operational-status.test.mjs`: failing tests for `isOfflineOperationalStatus` — every value in the fixed union accepted, an invalid string rejected, casing and empty-string rejected.
- [x] 2.2 GREEN — `lib/offline-monitoring/operational-status.ts`: `OfflineOperationalStatus` union (stopped/workshop, technical review, consulted/pending answer, reporting again, exception e.g. customer debt), `OFFLINE_OPERATIONAL_STATUSES` tuple, `isOfflineOperationalStatus()`. No colours here.
- [x] 2.3 RED — `tests/offline-board-row.test.mjs`: failing tests for `toBoardRow(incident, notification, now)` with fixed `NOW` — table covering all 5 states from design Decision 4 (`not_authorized`, `authorized_not_sent`, `dispatching`, `sent`, `failed`); assert `"delivered"` is never produced.
- [x] 2.4 GREEN — `lib/offline-monitoring/board-row.ts`: pure `toBoardRow()` implementing the state machine from design Decision 4.
- [x] 2.5 GREEN — `types.ts`: add `OfflineOperationalStatus`, `OfflineBoardRow`, `WhatsappQueryState`. **Also added `OperatorActor` here** (pulled forward from task 3.1): `OfflineBoardRow.reviewedBy` needs the shape, and duplicating it inline would have created a second source of truth. Task 3.1 is now a no-op for that type.
- [x] 2.6 GREEN (no RED — raw Mongo read, see Testing Convention Notes) — `lib/offline-monitoring/incident-review-store.ts`: `listBoardIncidents()` (active incidents), `findActiveIncidentById()`, and a single read-only `find({_id:{$in:[...]}})` against `gps_offline_notifications` with a `{status, failureReason}` projection.
- [x] 2.7 GREEN (no RED — composes 2.6/2.4, no dedicated test in design's Testability table) — `lib/offline-monitoring/operator-board-service.ts`: `listOperatorBoard()` composing `listBoardIncidents` + the notification join + `toBoardRow`.
- [x] 2.8 GREEN — `app/api/offline-board/incidents/route.ts`: `GET`, `runtime="nodejs"`, `dynamic="force-dynamic"`, returns `{success, rows, fetchedAt}`.
- [x] 2.9 REFACTOR — none required; keep `incident-review-store.ts` / `operator-board-service.ts` to their read-only halves (write functions land in Phase 4).
- [x] 2.10 Verify — `npm test` (118/118), `npm run lint` (clean), `npm run build` (clean; `/api/offline-board/incidents` registered as dynamic).

---

## Phase 3: Foundational Actor Infrastructure (PR 3, parallel-safe with PR 2)

Spec: `operator-directory` → "Operators Are Name-Only Records", "Seam For A Future Real Identity"; `offline-incident-audit-trail` → "Every Operator Action Appends An Immutable Event", "Audit Events Are Never Modified Or Deleted".

| Purpose | Files | Est. lines | Tests | Rollback boundary |
|---|---|---|---|---|
| Establish operator identity + immutable audit logging that every write action depends on; no behavior change yet (nothing writes through it) | `types.ts`, `operator-directory-store.ts` (new), `incident-audit-store.ts` (new), `app/api/offline-board/operators/route.ts` (new) | ~190 (all impl) | none — raw Mongo CRUD wrappers, see Testing Convention Notes; exercised indirectly by Phase 4-6 service tests | Revert 4 files; first consumer is Phase 4, so removal is a clean no-op elsewhere |

- [x] 3.1 GREEN — `types.ts`: add the audit event type/action union (`"status_change" | "comment_change" | "recheck" | "authorization"`). `OperatorActor` already landed in task 2.5 — do not redeclare it.
- [x] 3.2 GREEN — `lib/offline-monitoring/operator-directory-store.ts`: `gps_operators` collection, `{enabled:1, name:1}` index via `ensureOperatorIndexes()`, `listOperators()` (enabled only, `OperatorActor[]`), `findOperatorById()` (`null` for unknown/disabled).
- [x] 3.3 GREEN — `lib/offline-monitoring/incident-audit-store.ts`: `gps_offline_incident_events` collection, `{incidentId:1, createdAt:-1}` + `{createdAt:-1}` indexes via `ensureIncidentAuditIndexes()`, `appendOfflineIncidentAuditEvent()` (insertOne only — no update/delete export, so append-only is enforced by absent API), `listOfflineIncidentAuditEvents()`.
- [x] 3.4 GREEN — `app/api/offline-board/operators/route.ts`: `GET`, returns `{success, operators: {id,name}[]}`.
- [x] 3.5 Verify — `npm test` (118/118, no new tests this phase as planned), `npm run lint` (clean), `npm run build` (clean; `/api/offline-board/operators` registered as dynamic).

**Open operational prerequisite (not a code task, flagged during apply):** `gps_operators` ships empty and no task in this change seeds it. Until at least one `{_id, name, enabled: true, createdAt, updatedAt}` document is inserted manually, `GET /api/offline-board/operators` returns an empty list and every Phase 4/5/6 write action rejects with "unknown operator". Decide whether to document the manual insert in `README.md` (matching the existing `gps_company_contacts` convention) before Phase 4.

---

## Phase 4: Operator Review Write Path (PR 4)

Spec: `offline-incident-review` → all four requirements; `offline-incident-audit-trail` → "Status change appends an event with before/after".

| Purpose | Files | Est. lines | Tests | Rollback boundary |
|---|---|---|---|---|
| Operator records operational status/comment, attributed and audited, still without touching dispatch | `types.ts`, `incident-review-store.ts` (write half), `operator-board-service.ts` (write half), `app/api/offline-board/review/route.ts` (new), `tests/offline-operator-board-service.test.mjs` (new) | ~275 (175 impl + 100 test) | `offline-operator-board-service.test.mjs` — fakes `findOperator`, `applyReview`, `appendAudit`, `now` | Revert 5 files; Phase 2 read path and Phase 3 stores unaffected; board reverts to accurate read-only |

- [x] 4.1 RED — `tests/offline-operator-board-service.test.mjs`: failing tests for `submitOperatorReview` — (a) valid status+comment persists status/comment/operator/timestamp together in one update; (b) unknown operator id → rejected, zero writes (no incident update, no audit call); (c) invalid status (outside `OFFLINE_OPERATIONAL_STATUSES`) → rejected, zero writes; (d) comment of 1001 **trimmed** chars → rejected, zero writes, never truncated; (e) `status`/`active` never present in the applied update document; (f) success path appends exactly one audit event, `action:"status_change"`, correct before/after. Shipped 9 tests, adding unknown-incident and null-`before` first-review cases.
- [x] 4.2 GREEN — `types.ts`: already covered — `OfflineBoardIncident` carries `operationalStatus?`, `operatorComment?`, `reviewedAt?`, `reviewedBy?` since task 2.5. The review layer's own result contract (`OperatorReviewResult`) lives in `operator-board-service.ts`.
- [x] 4.3 GREEN (no RED — raw Mongo write) — `incident-review-store.ts`: `applyOperatorReview()` — `$set` for `operationalStatus`, `operatorComment`, `reviewedAt`, `reviewedBy` only; never touches `status`/`active`; never writes `"acknowledged"`. Uses `findOneAndUpdate({returnDocument:"before"})` so the audit `before` value comes from the same round trip — no read-then-write race. An omitted comment `$unset`s the field instead of storing `null`.
- [x] 4.4 GREEN — `operator-board-service.ts`: `submitOperatorReview()` — validate operator via `findOperatorById` → validate status via `isOfflineOperationalStatus` → validate **trimmed** comment length ≤1000 (reject, never truncate) → write → audit append, in that order.
- [x] 4.5 GREEN — `app/api/offline-board/review/route.ts`: `POST`, manual `typeof` validation, `{operatorId, incidentId, operationalStatus, comment?}` → `{success}` / `400` on validation or unknown operator/incident.
- [x] 4.6 REFACTOR — split the service's DI seam into `OperatorBoardReadDependencies` and `OperatorReviewDependencies` so neither function declares collaborators it does not use.
- [x] 4.7 Verify — `npm test` (127/127), `npm run lint` (clean), `npm run build` (clean; `/api/offline-board/review` registered as dynamic).

**Build-only failure caught here (tests and lint were both green while TypeScript failed):** hoisting the Mongo update into a `const` loses contextual typing, so `$unset: { operatorComment: "" }` widened to `string` and no longer matched the driver's `true | "" | 1`. Fixed with `"" as const`. Inline update objects (as in `notification-store.ts`) keep contextual typing and do not hit this. `npm test` alone would not have caught it.

---

## Phase 5: Authorization + Company-Scoped Dispatch (PR 5 — second safety-relevant slice)

Spec: `offline-notification-authorization` → "Authorization Records Operator And Timestamp", "Authorization Does Not Duplicate Existing Sends", "Immediate Company-Scoped Dispatch On Authorize", "Cron Scans And Persists But Dispatches Only Authorized Rows".

| Purpose | Files | Est. lines | Tests | Rollback boundary |
|---|---|---|---|---|
| First and only writer of `authorizedAt`/`authorizedBy`; triggers existing dispatch engine scoped to one company | `notification-service.ts` (modify, ~3 lines), `incident-review-store.ts` (add `markIncidentsAuthorized`), `authorization-service.ts` (new), `types.ts` (`SafeDispatchSummary`), `app/api/offline-board/authorize/route.ts` (new), `tests/offline-authorization-service.test.mjs` (new), `README.md` | ~330 (230 impl incl. README + 100 test) | `offline-authorization-service.test.mjs` — fakes `findOperator`, `markAuthorized`, `appendAudit`, `dispatch`, `now` | Revert 7 files; Phase 1's gate keeps filtering by `authorizedAt` — removing this slice returns to "gate closed, nothing can ever open it," strictly safer than today |

**Forbidden-zone check**: this phase does NOT touch `notification-store.ts`. `reserveOfflineNotification` keeps exactly one importer (`notification-service.ts`).

**Batching note**: the 10-vehicle cap (spec scenario "more than 10 rows splits into capped batches") is already enforced by the existing, untouched `notification-planner.ts` (covered by `tests/offline-notification-planner.test.mjs`) — no new task needed beyond feeding it the correctly-scoped incident list.

**Company-scope invariant note**: scoping matches on exact `companyName` string, safe because `scanner.ts:110,123` always writes `contact.companyName` (design Decision 2). If a future source writes a raw platform name instead, this scoping must switch to `normalizeMonitoringCompanyName` — flag, don't silently assume, if a future incident source is added.

- [x] 5.1 RED — `tests/offline-authorization-service.test.mjs`: failing tests for `authorizeOfflineIncidents` — (a) unknown operator → reject, zero writes (no stamp, no audit, no dispatch call); (b) valid operator + incident ids → stamp → audit → dispatch, in that call order; (c) incidents spanning 2 companies → exactly 2 scoped `dispatch` calls, one per distinct `companyName`, sequential; (d) an incident with `initialNotificationId` already set → stamp/audit still recorded but no duplicate reservation/dispatch attempted for it; (e) re-authorizing an already-sent incident succeeds without error or duplicate.
- [x] 5.2 GREEN — `notification-service.ts`: widen to `runOfflineNotificationDispatch(options: {send?: boolean; scope?: DispatchScope} = {}, ...)`, pass `options.scope` straight through to `dependencies.listIncidents(options.scope)`. Do NOT reuse the module-private DI override (design Decision 2 — `defaultDependencies` stays untouched and unexported). Shipped as 2 changed lines plus the type import.
- [x] 5.3 GREEN (no RED — raw Mongo write) — `incident-review-store.ts`: `markIncidentsAuthorized()` — `$set authorizedAt` (ISO) + `authorizedBy {id,name}` for the given incident ids. Returns `{id, companyName, initialNotificationId?}` per affected incident so the service can group by company without a second lookup.
- [x] 5.4 GREEN — `lib/offline-monitoring/authorization-service.ts`: `authorizeOfflineIncidents()` — validate operator → `markIncidentsAuthorized` → append one audit event per incident (`action:"authorization"`) → group by `companyName` → one `runOfflineNotificationDispatch({send:true, scope:{companyName}})` per distinct company, sequential.
- [x] 5.5 GREEN — `app/api/offline-board/authorize/route.ts`: `POST`, `{operatorId, incidentIds}` → `{success, dispatches: SafeDispatchSummary[]}`; `502` on unexpected upstream failure, `400` on validation/unknown operator.
- [x] 5.6 GREEN — `README.md`: document that `npm run offline:notify` now previews/sends **only authorized** incidents. Also documents the authorize route, the operator seed, and the missing-access-control caveat.
- [x] 5.7 REFACTOR — none required; re-confirmed by `rg`: `reserveOfflineNotification` still has exactly one importer (`notification-service.ts`).
- [x] 5.8 Verify — `npm test` (135/135; `offline-notification-service.test.mjs` and `offline-monitoring-daily-job.test.mjs` stayed green and untouched — zero-arg fakes remain valid against the widened optional `scope`, exactly as design Decision 2 predicted), `npm run lint` (clean), `npm run build` (clean; `/api/offline-board/authorize` registered as dynamic).

**Deferred at the user's request (2026-08-05):** an "generate message → edit → send" flow was considered and dropped. The offline alert is the Meta-approved template `vehicle_offline_followup` with exactly three variables, so its body text cannot be edited without Meta rejecting the send. Free-text editing would only work inside the 24-hour customer service window. A read-only preview before confirming is still cheap — the engine already supports `runOfflineNotificationDispatch({ send: false })` — and can be wired in Phase 7 with no backend change.

---

## Phase 6: On-Demand Recheck (PR 6)

Spec: `offline-vehicle-recheck` → all four requirements.

| Purpose | Files | Est. lines | Tests | Rollback boundary |
|---|---|---|---|---|
| Operator refreshes a single plate before authorizing, without waiting for the next cron | `recheck-service.ts` (new), `app/api/offline-board/recheck/route.ts` (new), `tests/offline-vehicle-recheck.test.mjs` (new) | ~270 (160 impl + 110 test) | `offline-vehicle-recheck.test.mjs` — fakes `getReports` (incl. throwing variant), `reconcile`, `findIncident`, `appendAudit`, `now` | Revert 3 files; independent of review/authorize paths |

- [x] 6.1 RED — `tests/offline-vehicle-recheck.test.mjs`: failing tests for `recheckOfflineVehicle` — (a) unknown operator → rejected, no incident/audit write; (b) unknown/inactive incident id → rejected, no write; (c) `getReports` throws → audit `{action:"recheck", outcome:"upstream_failure"}` appended, incident bytes unchanged, error surfaced; (d) report parses within threshold → `reconcile` called with one observation, audit `outcome:"applied"`; (e) report still delayed → `reconcile` called, `lastReportedAt`/derived age refresh, incident stays active; (f) `getReports` called with exactly `[plate]`, never more.
- [x] 6.2 GREEN — `lib/offline-monitoring/recheck-service.ts`: `recheckOfflineVehicle()` per design's Re-check Path — validate operator → `findActiveIncidentById` → `getCybermapaVehicleReports([plate])` → on throw: audit `upstream_failure`, surface error, incident untouched → parse/validate report → `calculateOfflineHours` vs `getOfflineThresholdHours` → `reconcileOfflineIncidents({observations:[obs], thresholdHours, checkedAt: now})` → audit `applied`/`no_change`. `companyName` for the observation comes from the stored incident, not from Cybermapa.
- [x] 6.3 GREEN — `app/api/offline-board/recheck/route.ts`: `POST`, `{operatorId, incidentId}` → `{success, outcome}`; `502` on upstream Cybermapa failure, `400` on validation/unknown operator/incident.
- [x] 6.4 REFACTOR — none required. `selectLatestValidReport` is a local helper mirroring `scanner.ts`'s `indexLatestValidReports`, including its future-dated-report rejection.
- [x] 6.5 Verify — `npm test` (145/145), `npm run lint` (clean), `npm run build` (clean; `/api/offline-board/recheck` registered as dynamic).

Errors surface as a discriminated `OfflineRecheckResult` rather than a thrown exception, matching the result contracts introduced in Phases 4 and 5, so the route maps `rejected` → 400, `upstream_failure` → 502 and only unexpected throws → 500.

---

## Phase 7: Board UI (PR 7 — ships last)

Spec: `retrasados-operator-board` → "Worksheet Row Data Contract", "Mutating Routes Validate Input And Protect Secrets", "No Application Authentication In This Change".

| Purpose | Files | Est. lines | Tests | Rollback boundary |
|---|---|---|---|---|
| Wire every backend route from Phases 2, 4, 5, 6 into one operator-facing worksheet; ships last so backend risk is already retired | `app/retrasados/page.tsx` (new), `app/retrasados/operator-board.tsx` (new) | ~310 | none — no React testing library in this repo (verified: `package.json` devDependencies; no existing test file for any `app/*.tsx`) | Revert 2 files; every API route keeps working headless (curl/script) since the UI is a pure consumer |

- [x] 7.1 GREEN — `app/retrasados/page.tsx`: Server Component, `export const dynamic = "force-dynamic"`, thin heading + `<OperatorBoard />`.
- [x] 7.2 GREEN — `app/retrasados/operator-board.tsx`: `"use client"`; fetch `/api/offline-board/incidents` and `/api/offline-board/operators` with `cache: "no-store"`; render worksheet rows (system, company, plate, last report + derived age, status, comment, review date, operator, WhatsApp-query state); operator `<select>` mirrored to `localStorage`. `STATUS_PRESENTATION` colour map lives **only** here, complete literal Tailwind class strings.
- [x] 7.3 GREEN — Review form (status + comment) calling `POST /api/offline-board/review`; refetch rows on success.
- [x] 7.4 GREEN — Multi-select + "Authorize" action calling `POST /api/offline-board/authorize`; refetch rows on success; render `dispatches` outcome per company.
- [x] 7.5 GREEN — Per-row "Re-check" action calling `POST /api/offline-board/recheck`; refetch rows on success.
- [x] 7.6 REFACTOR — confirmed zero `process.env` reads in both files. Two lint-driven corrections, both real rather than cosmetic (see note below).
- [x] 7.7 Verify — `npm run lint` (clean), `npm run build` (clean; `/retrasados` registered as dynamic), `npm test` (145/145, zero regression across all prior phases).

**Two corrections forced by `react-hooks/set-state-in-effect` during this phase:**

1. The operator selection was initially `useState` hydrated from `localStorage` inside an effect. Replaced with `useSyncExternalStore` over a small localStorage-backed store (`subscribeToStoredOperator` / `getStoredOperatorId` / `getServerOperatorId`). This removes the setState-during-hydration, keeps the server render deterministic by returning `""`, and syncs the selection across browser tabs for free.
2. The initial board load was a `useCallback` invoked from the effect. Replaced with a module-level `fetchBoardData()` returning data, consumed by an `async` loader declared *inside* the effect with an `isActive` guard — the exact idiom already used in `app/page.tsx:96-133`. This also fixed a real defect the original had: state could be written after unmount. `refreshBoard()` reuses the same fetcher for post-mutation refetches.

**Deviation from the plan's UI note:** the plan listed the operator selection as living "in client state, mirrored to `localStorage`". It now lives *in* `localStorage`, read through `useSyncExternalStore`. Same observable behaviour, and it is what the lint rule permits.
