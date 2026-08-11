# Design: Retrasados Operator Board

## Technical Approach

One choke point, one predicate. `listUnnotifiedActiveOfflineIncidents()` is the **only** production
source of dispatch-eligible incidents, so adding an authorization predicate **inside** it closes every
dispatch path at once. Everything else — operator review fields, audit trail, directory, re-check, board
UI — is additive surface that never touches the reservation/idempotency engine.

Verified call graph (`rg`, not assumed):

| Symbol | Production consumers | Test consumers |
|---|---|---|
| `listUnnotifiedActiveOfflineIncidents` | `notification-service.ts` `defaultDependencies` only | none |
| `reserveOfflineNotification` | `notification-service.ts` only | none |
| `runOfflineNotificationDispatch` | `daily-job.ts`, `scripts/notify-offline-vehicles.ts` | `offline-notification-service.test.mjs` |

---

## Architecture Decisions

### Decision 1 — The gate: predicate inside the eligibility query, built by one exported pure function

**Choice.** Change the signature to `listUnnotifiedActiveOfflineIncidents(scope?: DispatchScope)` and build
its Mongo filter through a new exported pure function in `incident-store.ts`:

```ts
export type DispatchScope = { companyName?: string };

export function buildDispatchEligibilityFilter(scope: DispatchScope = {}) {
  return {
    active: true,
    initialNotificationId: { $exists: false },
    authorizedAt: { $type: "string" },        // ← THE GATE, not composable away
    ...(scope.companyName ? { companyName: scope.companyName } : {}),
  };
}
```

**Why `$type: "string"` and not `$exists: true`.** `$exists: true` also matches `authorizedAt: null`.
Every timestamp in this codebase is an ISO string (`detectedAt`, `notifiedAt`, `createdAt`), so
`$type: "string"` matches *present AND a real timestamp*, and rejects `null`, `false`, and a stray `0`.

**Mongo semantics for pre-existing docs — proved.** A document with no `authorizedAt` key does not match
`{ authorizedAt: { $type: "string" } }`. Every incident written before this change is therefore excluded
with **zero backfill**. This is the same absence-means-no semantics the existing filter already relies on
via `initialNotificationId: { $exists: false }`.

**Closure proof — every dispatch path.**

| Path | How it reaches incidents | Gated? |
|---|---|---|
| Cron `GET /api/cron/offline-vehicles` → `runOfflineMonitoringDailyJob()` → `dispatch({send:true})` | default deps → `listUnnotifiedActiveOfflineIncidents()` | Yes |
| `npm run offline:notify` (`scripts/notify-offline-vehicles.ts`) | default deps → same function | Yes |
| New `POST /api/offline-board/authorize` | **same function**, only narrowed by `scope` — it does *not* inject a replacement `listIncidents` | Yes |

The route cannot hand-roll a query that forgets the predicate, because scoping is an **argument to the
gated function**, not a substitute for it. The base filter is not exported as a spreadable object —
only the builder is, and the builder always emits the predicate.

**Residual hole (named, not hidden).** Any *future* module that queries `gps_offline_incidents` directly and
calls `reserveOfflineNotification` would bypass the gate. Mitigations: `reserveOfflineNotification` keeps
exactly one importer (`notification-service.ts`), and a DB-free unit test asserts
`buildDispatchEligibilityFilter()` contains `authorizedAt: { $type: "string" }`.

**Alternatives rejected.**

| Option | Real tradeoff | Verdict |
|---|---|---|
| Job-level gate: delete `dispatch()` from `daily-job.ts:18` | Cron stops retrying notifications whose reservation was released after a Meta rejection — they never self-heal. Also leaves `offline:notify` ungated. | Rejected |
| Guard inside `reserveOfflineNotification` | Modifies the idempotency engine (explicit non-goal) and rejects *after* planning, so `notificationCount` would report sends that never happen. | Rejected |
| Separate `gps_authorized_dispatches` queue collection | Second source of truth; incident and queue drift when the scanner resolves a row; needs its own cleanup. | Rejected |
| Env kill-switch | All-or-nothing; cannot express per-row intent. Emergency override only. | Rejected |

### Decision 2 — Dispatch on authorize: add `options.scope`, do NOT reuse the DI override

**Choice.** `runOfflineNotificationDispatch({ send: true, scope: { companyName } })`. The service passes
`options.scope` straight through: `dependencies.listIncidents(options.scope)`. ~3 changed lines.

**Why not the existing dependency override.** Verified in `notification-service.ts`: both
`OfflineNotificationDependencies` (line 19) and `defaultDependencies` (line 29) are **module-private —
neither is exported**. So a caller cannot spread the defaults and swap one key. Reusing that seam would
force either (a) exporting the engine's internal wiring, inviting partial-override drift, or (b) the route
re-declaring all seven dependencies, which would silently pin `listContacts: () => listEnabledCompanyContacts("CYBERMAPA")`
and diverge the day that wiring changes. The proposal's premise that "the module already accepts a full
dependency override" is true only for a *complete* object — this correction is the reason for the change.

**Deeper reason.** The DI seam exists so tests can substitute collaborators. If production also substitutes
`listIncidents`, then tests replace exactly the object that could be misconfigured in production — the bug
becomes untestable. Scope stays data; wiring stays wiring.

**Compatibility.** Adding an optional parameter keeps `typeof listUnnotifiedActiveOfflineIncidents`
assignable from zero-arg fakes, so `tests/offline-notification-service.test.mjs` and
`tests/offline-monitoring-daily-job.test.mjs` stay green untouched.

**Scoping key.** `companyName` exact match, not a normalized key. Safe because `scanner.ts:110,123` always
writes `contact.companyName` into the observation, so all incidents for one company share a byte-identical
string. If an operator multi-selects across companies, the service runs one scoped dispatch per distinct
`companyName`, sequentially.

**Alternatives rejected.** Route calls planner + reserve + send directly (duplicates the engine, loses the
deterministic `_id`). Authorize-only, wait for cron (violates settled decision 1; up to 24 h of silence).

### Decision 3 — Operator state lives in separate fields *and* a separate module

Scanner keeps sole ownership of `status` / `active`. Operator writes live in a new
`incident-review-store.ts`; `incident-store.ts` never writes an operator field and the review store never
writes `status` or `active`. The boundary is enforced by module, not by comment. `"acknowledged"` stays dead.

### Decision 4 — WhatsApp-query state needs a read-only join (correction to explore.md)

The incident document alone **cannot** express `failed`. Verified from `notification-store.ts` +
`tests/offline-notification-service.test.mjs` — and note the explore doc has this backwards:

| Failure kind | `releaseForRetry` | Incident stamps | Notification doc |
|---|---|---|---|
| Meta template rejection (`OfflineTemplateRejectedError`) | `true` | **unset** | `failed`, `retryable: true` |
| Ambiguous transport error | `false` | **kept** | `failed`, `retryable: false` |

So the board reads `gps_offline_notifications` read-only, one `find({_id: {$in: [...]}} )` with a
`{status, failureReason}` projection per fetch. No write, no engine change.

State machine (pure, in `board-row.ts`):

```
no authorizedAt                                  → "not_authorized"
authorizedAt, no initialNotificationId           → "authorized_not_sent"
initialNotificationId → notification.status = pending   → "dispatching"
                                       accepted  → "sent"        (never "delivered")
                                       failed / cancelled → "failed"
```

A Meta-rejected row correctly falls back to `authorized_not_sent` and the cron retries it — the
self-healing behaviour that Decision 1's rejected alternative would have destroyed.

---

## Data Flow

```
Operator (browser, /retrasados)
   │ { operatorId, incidentIds }        attribution only — NOT access control
   ▼
POST /api/offline-board/authorize        runtime="nodejs", dynamic="force-dynamic"
   ├─► operator-directory-store.findOperatorById ──► gps_operators
   │       └─ unknown → 400, nothing written anywhere
   ├─► incident-review-store.markIncidentsAuthorized ──► gps_offline_incidents
   │       $set authorizedAt (ISO), authorizedBy {id,name}
   ├─► incident-audit-store.append ───────────────────► gps_offline_incident_events
   └─► notification-service.runOfflineNotificationDispatch({send:true, scope:{companyName}})
          └─► incident-store.listUnnotifiedActiveOfflineIncidents(scope)
                 buildDispatchEligibilityFilter(scope)   ◄══ THE GATE
          └─► notification-planner (≤10/msg)  ─► notification-store  ─► whatsapp-template-client
                     UNCHANGED                     UNCHANGED              UNCHANGED
```

---

## Data Model

### `gps_offline_incidents` — additive optional fields only

```ts
authorizedAt?: string;                    // ISO — the gate
authorizedBy?: OperatorActor;
operationalStatus?: OfflineOperationalStatus;
operatorComment?: string;                 // ≤ 1000 chars
reviewedAt?: string;                      // ISO, operator-set (≠ system lastCheckedAt)
reviewedBy?: OperatorActor;
```

**Indexes: none added.** Justified, not lazy — the board query is `{active:true}` and the gated query is
`{active:true, initialNotificationId, authorizedAt, companyName?}`; both are served by the existing
`{active:1, companyName:1}` index at this cardinality (tens–low hundreds of active incidents). An index on a
usually-absent optional field would cost writes on every scan for no measurable read gain. Revisit if active
incidents exceed a few thousand.

### `gps_offline_incident_events` — new, append-only

Name deliberately avoids the unrelated `cybermapa_authorizations` / `cybermapa_audit_events` collections;
follows the `gps_` prefix used by this domain.

```ts
{ incidentId: string; action: "status_change" | "comment_change" | "recheck" | "authorization";
  actor: OperatorActor; before?: string | null; after?: string | null;
  outcome?: "applied" | "no_change" | "upstream_failure"; createdAt: string }
```

Indexes via memoized `ensureIncidentAuditIndexes()`: `{incidentId:1, createdAt:-1}`, `{createdAt:-1}` —
same shape as `cybermapa_audit_events` in `agent-tools.ts:47-50`. Only `insertOne` is ever exported; no
update or delete function exists, so append-only is enforced by absent API, not by discipline.

### `gps_operators` — new, credential-free

```ts
{ _id: string; name: string; enabled: boolean; createdAt: string; updatedAt: string }
```

String `_id` matches `gps_company_contacts` / `cybermapa_authorizations`. The **read shape returned anywhere**
is `OperatorActor = { id: string; name: string }` — nothing else crosses a module or network boundary.
`enabled` is a small deliberate addition beyond the spec letter: retiring an operator by deletion would leave
audit rows pointing at a vanished id; disabling is the non-destructive path and mirrors `gps_company_contacts.enabled`.
A disabled operator reads as unknown and is rejected. Index: `{enabled:1, name:1}` via `ensureOperatorIndexes()`.

### Actor snapshot, not reference

Audit events and incident stamps store `{id, name}` **by value**. Renaming or deleting an operator never
rewrites history, and it is the seam that lets a real authenticated identity slot in unchanged.

---

## Migration / Back-Compat

**No migration, no backfill, no down-migration.** Absence is meaningful in both directions:

| Absent field | Reads as | Enforced by |
|---|---|---|
| `authorizedAt` | not authorized → never dispatched | `$type: "string"` excludes missing keys |
| `operationalStatus` / `operatorComment` / `reviewedAt` / `reviewedBy` | unreviewed; board shows empty, **never inferred from `status`** | pure mapper in `board-row.ts` |
| no audit events for an incident | truthful — no operator ever acted on it | append-only by construction |

Already-notified incidents stay excluded by the untouched `initialNotificationId` predicate. Rollback =
delete one line from `buildDispatchEligibilityFilter`; the new fields and collections are inert to the
scanner and the notification engine.

---

## Module Layout

Every new `lib/` module exports `defaultDependencies` and takes an optional `dependencies` override, matching
`scanner.ts` / `daily-job.ts` / `notification-service.ts`.

| File | Action | Responsibility |
|---|---|---|
| `lib/offline-monitoring/operational-status.ts` | Create | `OfflineOperationalStatus` union, `OFFLINE_OPERATIONAL_STATUSES` tuple, `isOfflineOperationalStatus()`. Pure. No colours. |
| `lib/offline-monitoring/board-row.ts` | Create | Pure `toBoardRow(incident, notification, now)`: derived age + WhatsApp-query state. |
| `lib/offline-monitoring/operator-directory-store.ts` | Create | `gps_operators`; `listOperators()`, `findOperatorById()`. |
| `lib/offline-monitoring/incident-audit-store.ts` | Create | `gps_offline_incident_events`; `appendOfflineIncidentAuditEvent()`, `listOfflineIncidentAuditEvents()`. Insert-only. |
| `lib/offline-monitoring/incident-review-store.ts` | Create | Operator-owned writes/reads on `gps_offline_incidents`: `listBoardIncidents()`, `applyOperatorReview()`, `markIncidentsAuthorized()`, `findActiveIncidentById()`. |
| `lib/offline-monitoring/operator-board-service.ts` | Create | `listOperatorBoard()`, `submitOperatorReview()` — validation, review write, audit append. |
| `lib/offline-monitoring/authorization-service.ts` | Create | `authorizeOfflineIncidents()` — validate → stamp → audit → per-company scoped dispatch. |
| `lib/offline-monitoring/recheck-service.ts` | Create | `recheckOfflineVehicle()` — single-plate fetch, reconcile, audit. |
| `lib/offline-monitoring/incident-store.ts` | Modify | `buildDispatchEligibilityFilter()`, optional `scope` param, new optional document fields. |
| `lib/offline-monitoring/notification-service.ts` | Modify | `options.scope` passed to `dependencies.listIncidents(scope)`. ~3 lines. |
| `lib/offline-monitoring/types.ts` | Modify | `OperatorActor`, `OfflineOperationalStatus`, `OfflineBoardRow`, `WhatsappQueryState`, `DispatchScope`. |
| `notification-store.ts`, `notification-planner.ts`, `scanner.ts`, `daily-job.ts`, `cron/route.ts`, `vercel.json` | **Untouched** | Reservation, batching, detection, schedule all unchanged. |
| `README.md` | Modify | Record that `npm run offline:notify` now previews/sends **only authorized** incidents. |

---

## API Routes

All: `export const runtime = "nodejs"`, `export const dynamic = "force-dynamic"`, manual `typeof` validation,
no schema library, `Response.json({ success, error? }, { status })`.

| Route | Method | Body / Result |
|---|---|---|
| `/api/offline-board/incidents` | GET | `{success, rows: OfflineBoardRow[], fetchedAt}` |
| `/api/offline-board/operators` | GET | `{success, operators: {id,name}[]}` |
| `/api/offline-board/review` | POST | `{operatorId, incidentId, operationalStatus, comment?}` |
| `/api/offline-board/recheck` | POST | `{operatorId, incidentId}` |
| `/api/offline-board/authorize` | POST | `{operatorId, incidentIds: string[]}` → `{success, dispatches: SafeDispatchSummary[]}` |

**Flat routes, no dynamic `[incidentId]` segment.** The repo has zero dynamic segments today; introducing one
drags in the Next.js 15+ async-`params` contract for no benefit. `incidentId` travels in the body.

**Status codes.** Validation failure, unknown operator, unknown/inactive incident → `400`. Cybermapa
unreachable → `502` (matches `/api/whatsapp/send`). Unexpected → `500`. Deliberately **not** `401`/`403` for
unknown operator: those imply an authentication system that does not exist and would mislead the reader.

**Secrets.** Routes import only `lib/` modules; every env read stays server-side. The authorize response reuses
the dispatch engine's existing safe shape (`toSafePreview`), which already masks the recipient phone. Accepted
sends are reported as `sent`/`accepted` — never `delivered`.

---

## UI

| Concern | Decision |
|---|---|
| Route | `/retrasados` |
| Split | `app/retrasados/page.tsx` — Server Component, thin shell (heading + `<OperatorBoard />`). `app/retrasados/operator-board.tsx` — `"use client"`, owns all data. |
| Why | One data path. A server-side initial fetch plus a client refetch would be two paths that can drift; the client-fetch idiom already exists in `app/page.tsx` (`/api/whatsapp/messages`). |
| Freshness | `dynamic = "force-dynamic"` on the route + `cache: "no-store"` on every fetch; refetch after each mutation. No ISR, no `use cache`. |
| Colours | `STATUS_PRESENTATION: Record<OfflineOperationalStatus, {label, className}>` lives **only** in `operator-board.tsx`. Never persisted, never in an API payload. Tailwind 4 classes written as complete literal strings so the JIT scanner sees them. |
| Operator selection | `<select>` fed by `/api/offline-board/operators`, kept in client state, mirrored to `localStorage` for convenience, sent as `operatorId` on every mutation. **Attribution, not security** — the server-side check is data integrity, and a caller can claim any listed name. |
| Secrets | Client component reads no `process.env`. Payloads carry rows and masked dispatch summaries only. |

---

## Re-check Path

```
validate operatorId ──unknown──► 400, no incident write, NO audit event
       │ known
       ▼
findActiveIncidentById ──missing──► 400
       │
       ▼
getCybermapaVehicleReports([incident.plate])       // already accepts a 1-plate array
       │                    └── throws ──► audit {action:"recheck", outcome:"upstream_failure"}
       │                                   ► 502, incident bytes UNCHANGED
       ▼ ok
parseCybermapaReportedAt → invalid / plate absent ─► audit outcome:"no_change", 200, no write
       │ valid
       ▼
calculateOfflineHours(now, reportedAt) vs getOfflineThresholdHours()
       ▼
reconcileOfflineIncidents({ observations:[obs], thresholdHours, checkedAt: now })
       ▼
audit {action:"recheck", before:lastReportedAt, after:reportedAt, outcome:"applied"}
```

- `companyName` for the observation comes from the **stored incident**, because `DATOSACTUALES` returns only
  `{plate, reportedAt}` (verified in `lib/cybermapa/services.ts`).
- Reconcile is reached only on a parsed, valid report, so an upstream failure can never overwrite
  `lastReportedAt` with garbage.
- Known, intended behaviour: `reconcileOfflineIncidents` upserts. If the scanner resolved the row between
  board load and re-check and the vehicle is still offline, a **new** incident is created — with no operator
  fields, therefore unauthorized, therefore un-dispatchable. Safe by construction.

---

## Testability

`node:test` + `node:assert/strict`, flat `tests/*.test.mjs`, plain-object fakes from local factory functions,
no mocking library, fixed `const NOW`, no `beforeEach`/`afterEach`, sentence-style titles.

| Test file | Target | DI seam / what is faked |
|---|---|---|
| `offline-dispatch-eligibility.test.mjs` | `buildDispatchEligibilityFilter` | **Pure — nothing faked.** Asserts `authorizedAt: {$type:"string"}` present with and without scope. This is the gate's regression alarm. |
| `offline-board-row.test.mjs` | `toBoardRow` | **Pure.** Fixed `NOW`; table of incident+notification pairs → each of the 5 query states; asserts `"delivered"` is never produced. |
| `offline-operational-status.test.mjs` | `isOfflineOperationalStatus` | **Pure.** Valid values, colour strings, casing, empty. |
| `offline-operator-board-service.test.mjs` | `submitOperatorReview` | Fakes `findOperator`, `applyReview`, `appendAudit`, `now`. Asserts 1001-char comment rejected with zero writes, invalid status rejected, `status`/`active` never in the update document. |
| `offline-authorization-service.test.mjs` | `authorizeOfflineIncidents` | Fakes `findOperator`, `markAuthorized`, `appendAudit`, `dispatch`, `now`. Asserts ordering (stamp → audit → dispatch), one scoped dispatch per distinct `companyName`, unknown operator writes nothing. |
| `offline-vehicle-recheck.test.mjs` | `recheckOfflineVehicle` | Fakes `getReports` (incl. a throwing variant), `reconcile`, `findIncident`, `appendAudit`, `now`. Asserts exactly one plate requested, `reconcile` never called on failure, audit appended on every outcome. |

Time is injected as an option on every service (`now?: string`), mirroring `runCybermapaOfflineCheck(options.now)`.
Cybermapa is injected as `getReports`, mirroring `CybermapaOfflineCheckDependencies`.

---

## The Auth Seam

**Verified, not assumed**: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:11`
— *"The `middleware` file convention is deprecated and has been renamed to `proxy`."* A root `proxy.ts`
exporting `proxy(request: NextRequest)` plus `config.matcher` is the Next.js 16 name.

When real login arrives, exactly three things change:

1. Add root `proxy.ts` with `matcher: ["/retrasados", "/api/offline-board/:path*"]`.
2. Swap the body of a single route-layer helper `resolveActor(request, body): Promise<OperatorActor | null>`
   — today it looks `body.operatorId` up in `gps_operators`; tomorrow it reads the session. Introduced now
   precisely so the swap is one function.
3. `gps_operators` either gains an identity link or is superseded by a user table.

**Unchanged**: the audit event contract. Because `actor` is an embedded `{id, name}` snapshot, historic events
stay valid and no audit migration is ever needed.

---

## Resolved Open Items

| Item | Spec choice | Verdict | Justification |
|---|---|---|---|
| Comment length bound | 1000 chars | **Confirmed**, with two refinements | Matches the existing `failureReason.slice(0, 1_000)` precedent in `notification-store.ts:234`. Refinements: (a) measure the **trimmed** string, (b) **reject**, never truncate — silently dropping the tail of an operator's justification is worse than a visible 400, and truncation would leave the audit `after` value disagreeing with the incident. |
| Unknown operator | Hard rejection | **Confirmed**, status `400` | Soft-accepting would poison the audit trail with unverifiable actors, destroying the one artefact that survives the no-login period. Explicitly `400` (bad data), not `401`/`403` — the latter would imply an auth system that this change deliberately does not build. Nothing is written: no incident update, no audit event. |
| Board freshness | Live query per fetch | **Confirmed**, mechanism specified | `dynamic = "force-dynamic"` + `cache: "no-store"` + refetch after every mutation. A stale row is not a cosmetic defect: authorizing it sends a real WhatsApp to a client company about a vehicle that is already reporting. Correctness beats latency at this data volume. |

---

## Files: Created vs Modified

**Created (20)** — `lib/offline-monitoring/`: `operational-status.ts`, `board-row.ts`,
`operator-directory-store.ts`, `incident-audit-store.ts`, `incident-review-store.ts`,
`operator-board-service.ts`, `authorization-service.ts`, `recheck-service.ts` ·
`app/api/offline-board/`: `incidents/route.ts`, `operators/route.ts`, `review/route.ts`, `recheck/route.ts`,
`authorize/route.ts` · `app/retrasados/`: `page.tsx`, `operator-board.tsx` · `tests/`: the 6 files above.

**Modified (4)** — `lib/offline-monitoring/incident-store.ts`, `notification-service.ts`, `types.ts`, `README.md`.

**Deleted (0).** **Explicitly untouched** — `notification-store.ts`, `notification-planner.ts`, `scanner.ts`,
`daily-job.ts`, `app/api/cron/offline-vehicles/route.ts`, `vercel.json`, `scripts/*`, and all existing tests.

---

## Changed-Line Estimate (for PR sizing)

| Area | ~Lines | Suggested slice |
|---|---|---|
| Gate + eligibility filter + types (`incident-store.ts`, `types.ts`) | 60 | 1 |
| Status vocabulary + board row mapper | 90 | 1 |
| Board read path (`incident-review-store` read half, `operator-board-service` read half, GET routes) | 150 | 1 |
| Board UI (read-only) | 180 | 1 |
| Tests: gate filter, board row, status vocabulary | 190 | 1 |
| Review write path + audit store + operator directory + POST `/review` | 260 | 2 |
| Tests: board service, audit, directory | 150 | 2 |
| Authorization service + `options.scope` + POST `/authorize` + UI selection/authorize | 240 | 3 |
| Tests: authorization service | 90 | 3 |
| Re-check service + POST `/recheck` + UI action | 190 | 4 |
| Tests: re-check | 100 | 4 |
| `README.md` | 20 | 4 |
| **Total** | **≈ 1720** | |

**400-line budget: exceeded roughly 4×.** Slice 1 alone lands ≈ 670 lines and still needs splitting — the
tasks phase should treat "gate + types + filter test" as its own reviewable unit (≈ 250 lines) that already
delivers the safety outcome, with the read-only UI following. Slice 1 is independently shippable: after it,
automatic dispatch is stopped and nothing can be sent without explicit authorization, before any write action exists.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Board and mutating routes publicly reachable.** Anyone with the URL can authorize a real WhatsApp send to a client company. | High | **Accepted and recorded.** No code mitigation in this change (explicit non-goal). Restrict via Vercel deployment protection or IP allowlist **before** real operational use. The `proxy.ts` seam above is the code-side follow-up. Escalate if the board goes live unprotected. |
| A future module queries incidents directly and bypasses the gate | Low | `reserveOfflineNotification` keeps exactly one importer; `buildDispatchEligibilityFilter` unit test alarms on predicate removal. |
| `explore.md` inverted the Meta-rejection retry semantics | Confirmed present | Corrected in Decision 4 from source + existing tests. The board state machine is built on the corrected behaviour; downstream phases must not re-read the explore doc for this detail. |
| Multiple messages to one company from one-at-a-time authorization | Medium | Zero-cost only: multi-select + single authorize action. No batching window, no deferred queue (settled decision). |
| Company-scoped dispatch misses rows if `companyName` strings ever diverge | Low | Invariant verified at `scanner.ts:110,123` — always `contact.companyName`. If a future source writes a raw platform name, scoping must switch to `normalizeMonitoringCompanyName`. Noted for the tasks phase. |
| Re-check upserts a new incident after a scanner resolve | Low | Intended. The new incident has no `authorizedAt`, so it is un-dispatchable until explicitly authorized. |
| Board join to `gps_offline_notifications` adds a read per fetch | Low | Single `$in` query with a 2-field projection; read-only, no engine change. |
| Operator attribution unverified | High | Accepted. Audit events are still recorded and the `{id, name}` actor shape survives real auth unchanged. |

---

## Open Questions

None blocking. All three spec-flagged items are resolved above; the one deferred decision (external access
restriction) is an explicit operations task outside this repository.
