# Exploration: retrasados-operator-board

Status: complete
Artifact store: hybrid (mirror of Engram `sdd/retrasados-operator-board/explore`)

## Current state — the exact auto-dispatch seam

The daily pipeline is `app/api/cron/offline-vehicles/route.ts` (Vercel cron `0 12 * * *` = 09:00 ART, gated by
`CRON_SECRET` bearer header with timing-safe compare) calling `runOfflineMonitoringDailyJob()`:

```ts
// lib/offline-monitoring/daily-job.ts, lines 17-18
const scan = await dependencies.scan({ persist: true });
const notifications = await dependencies.dispatch({ send: true });
```

Line 18 is the automatic-dispatch boundary. No condition guards it.

Only three callers of `runOfflineNotificationDispatch` exist in the repo: `daily-job.ts`, the manual script
`scripts/notify-offline-vehicles.ts`, and its own test. Nothing else breaks if this call is gated.

## Incident lifecycle and notification idempotency

`gps_offline_incidents` (`lib/offline-monitoring/incident-store.ts`):

```
{ system, companyName, plate, active, status: "pending" | "acknowledged" | "resolved",
  lastReportedAt, thresholdHours, offlineHoursAtDetection, detectedAt, lastCheckedAt,
  createdAt, updatedAt, resolvedAt?, resolutionReason?,
  initialNotificationId?, notificationAssignedAt?, notifiedAt? }
```

Indexes: unique partial `{system:1, plate:1}` where `active:true`; secondary `{active:1, companyName:1}`.

`status: "acknowledged"` is declared in the TypeScript union but never written anywhere — dead state, confirming no
operator workflow exists today. In practice the lifecycle is binary: `pending`/`active:true` on detection, then
`resolved`/`active:false` as soon as the vehicle reports again within threshold. There is no manual close or dismiss
path.

`gps_offline_notifications` (`notification-store.ts`): idempotency key
`_id = "offline:" + sha256(system + sorted(incidentIds))`. `reserveOfflineNotification` atomically inserts (or retries a
`failed` + `retryable` doc), then stamps `initialNotificationId` / `notificationAssignedAt` on every underlying
incident.

CORRECTION (verified against source during the design phase — the original wording in this paragraph was inverted.
Trust the table below, not any cached copy of this document): `markOfflineNotificationFailed(notificationId, reason,
{ releaseForRetry })` is called from `notification-service.ts:136` with
`releaseForRetry: error instanceof OfflineTemplateRejectedError`. Therefore:

| Failure kind | `releaseForRetry` | Incident stamps | Notification doc |
| --- | --- | --- | --- |
| Meta template rejection | `true` | unset inside a MongoDB transaction | `failed`, `retryable: true` |
| Ambiguous transport failure | `false` | kept | `failed`, `retryable: false` |

The rationale is send-safety: an ambiguous transport failure may mean the message actually went out, so the reservation
is deliberately NOT released; an explicit Meta rejection means nothing was sent, so the reservation is safe to free.

Direct consequence for the board: the incident document alone cannot express a `failed` WhatsApp-query state, so the
board read model needs a read-only `$in` join to `gps_offline_notifications`.

Cleanest gate: `listUnnotifiedActiveOfflineIncidents()` filters `{active:true, initialNotificationId:{$exists:false}}`.
Adding an authorization predicate to this query gates dispatch with zero changes to the reservation/retry machinery,
which is already fully covered by existing tests.

Batching mismatch to resolve: `notification-planner.ts` groups incidents by company into batches of up to 10 vehicles
(`MAX_VEHICLES_PER_OFFLINE_NOTIFICATION`). One WhatsApp send covers up to 10 rows, so per-vehicle-row authorization
versus per-company-batch dispatch is a product decision.

## Operator identity does not exist

`lib/whatsapp-human-handoff.ts` (exercised by `tests/whatsapp-human-handoff.test.mjs`) only builds a static `wa.me`
deep link to one `HUMAN_SUPPORT_PHONE`. There is no agent, session, or attribution record anywhere in the repo. The
operator concept is from-scratch surface area.

Naming collision to avoid: `lib/cybermapa/access-store.ts` already owns a `cybermapa_authorizations` collection, which
controls which end-user WhatsApp numbers may query which plates via the Gemini tool. It is unrelated to operator
authorization, so new fields and collections must use distinct names.

## Cybermapa data available

- `getCybermapaVehicles()` (GETVEHICULOS): companyName, make, model, color, year, plate, description, gpsId,
  moduleName, alias, name. No status, no last report.
- `getCybermapaVehicleReports(plates: string[])` (DATOSACTUALES): `{plate, reportedAt}`. Already accepts a single-plate
  array — this is a ready-made per-vehicle re-check path with no new integration required.
- `getCurrentCybermapaVehicleStatus(identifier, type)`: richer telemetry (lat/long, speed, event code), single
  identifier only. Heavier than needed for "last report"; reserve for a future richer status column.

None of these return operational status, comment, review date, or operator. Those are entirely new persistence.

## Gap analysis: worksheet columns versus available data

| Column | Source today | Gap |
| --- | --- | --- |
| System / Company / Vehicle | `incident.system` / `companyName` / `plate` | none |
| Last report (timestamp + age) | `incident.lastReportedAt` | age derived at render time, not stored |
| Operational status (blue/yellow/orange/green + exceptions) | `incident.status` (pending / dead `acknowledged` / resolved) | full gap — new vocabulary, persistence and colour mapping |
| Comment | none | full gap — new free-text field |
| Review date | `incident.lastCheckedAt` is system-driven, not operator-set | full gap — new operator-set review timestamp |
| Operator | none | full gap — no identity model at all |
| WhatsApp-query state | `initialNotificationId` / `notifiedAt` plus notification doc status | needs a new pre-state: "not yet authorized" |

## Conventions confirmed for downstream phases

- Every `lib/offline-monitoring/*` module exports `defaultDependencies` and accepts an optional `dependencies`
  override. This is the dependency-injection seam strict TDD extends (see `tests/offline-monitoring-daily-job.test.mjs`,
  `tests/offline-notification-service.test.mjs`, `tests/offline-monitoring-cron-route.test.mjs`).
- API routes return plain `Response.json({ success, error? }, { status })`, validate with manual `typeof` checks, use no
  schema library, and set `runtime = "nodejs"` and `dynamic = "force-dynamic"`. No route has real authentication except
  the cron bearer secret. `app/page.tsx` and `/api/whatsapp/*` are fully public today.
- MongoDB indexes follow a memoized `ensureXIndexes()` created lazily inside the first store call. Replicate this for
  any new collection.
- Verified against `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` (not assumed): Next.js 16
  renamed `middleware.ts` to `proxy.ts` with the same functionality. A future login seam for this board should be
  planned around `proxy.ts`.

## Options

### (a) Gating auto-dispatch

1. **Filter-based gate (recommended).** Add authorization fields to the incident document and require them in
   `listUnnotifiedActiveOfflineIncidents()`. The cron keeps running unchanged and dispatch no-ops until authorized;
   pair with an operator-triggered route that authorizes and immediately dispatches for instant feedback. Low effort,
   zero changes to tested reservation/retry code.
2. **Job-level gate.** Remove the unconditional dispatch call from `daily-job.ts`; the cron becomes scan-only and
   dispatch is only ever operator-triggered. Low-to-medium effort. Downside: retryable failed notifications no longer
   self-heal on the next cron tick.
3. **Environment kill-switch.** Coarse and all-or-nothing; does not fit a per-vehicle worksheet. Only viable as an
   emergency override alongside option 1.

### (b) Operator attribution without login

1. Free-text name per action. Simplest, typo-prone.
2. **Small reference collection (recommended)** holding operator names only, no credentials, surfaced as a UI dropdown;
   store the id and name on the incident. Clean seam to a real user/login table later without touching the incident
   schema.
3. Browser-remembered name as convenience layered on 1 or 2. No security value.

### (c) Re-check on demand

1. **Reuse `getCybermapaVehicleReports([plate])` (recommended).** Wrap in a thin function, recompute via existing
   `normalizers.ts` helpers, reconcile through existing `reconcileOfflineIncidents([observation])`. Low effort, no new
   integration.
2. `getCurrentCybermapaVehicleStatus(plate)`. Richer but heavier; reserve for later.

## Open questions needing a product decision

1. Authorization granularity versus 10-vehicle WhatsApp batching: send partial batches immediately, or wait for the
   full company batch?
2. Does authorize always mean "send now" (synchronous), or can it queue for the next cron?
3. Are exception statuses (for example customer debt) a fixed enum or an admin-configurable list?
4. Does the new operational status replace or sit alongside the existing system-owned `incident.status` / `active`
   fields, and who owns transitions?
5. How is "external access restricted temporarily" implemented (IP allowlist, Vercel deployment protection, shared
   secret)? This determines whether the repo needs any code change for that requirement at all.
6. Does the worksheet need an audit trail of past authorizations and status changes, or only current state?

## Recommendation

Gate via filter-based authorization on the incident document (a.1), add a small operator reference collection (b.2),
and reuse the existing single-plate report fetch for re-check (c.1). This is the lowest-effort path that reuses all of
the tested reservation, idempotency and scanner code, and leaves the cleanest seam for real login later.
