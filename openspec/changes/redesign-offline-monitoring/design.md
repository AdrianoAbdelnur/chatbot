# Design: Redesign Offline Monitoring

## Technical Approach

Keep the existing incidents, review, authorization, audit, batching, and notification reservation. Add a catalog/membership boundary, one shared check orchestrator, durable check history, and an inbound-message router. Next.js Route Handlers remain thin Node.js adapters; local Next 16 docs confirm handlers are public/non-cached by default and `after()` is duration-bound, so `after()` becomes only a best-effort worker wake-up. Reuse the process-wide Mongo client; pool tuning waits for workload measurements.

## Architecture Decisions

| Decision | Choice and rationale | Rejected |
|---|---|---|
| Vehicle identity | `_id = CYBERMAPA:<normalizedPlate>` because checks/incidents are plate-addressed and GPS devices can move. Store `gpsId` and company snapshots; duplicate plates or a changed non-empty `gpsId` become `identityConflict`, disabled/fail-closed until reviewed. Company moves preserve identity. | `gpsId` as identity; contact-owned plates |
| Persistence | Separate bounded records: registry/catalog, execution headers, one outcome per execution/vehicle, and offline responses. This avoids unbounded execution arrays and cross-domain deletion. | Embed history in incidents; one growing history document |
| Processing | Mongo-backed inbox jobs with leases and retry timestamps; `after()` may drain jobs, while a `CRON_SECRET` route drains due work. Persist each stage before branching. Retry idempotent stages; uncertain external-send states require review rather than risk duplicates. | `after()`-only; in-memory queue |
| Integration | One injected `runOfflineCheck` use case serves cron and manual flows; only valid observations reach existing reconciliation. | Parallel scanners |

## Data Model and Indexes

- `gps_offline_monitoring_registry`: vehicle `_id`, system, plate, gps/company snapshots, `present`, `enabled`, `identityStatus`, `firstSeenAt/lastSeenAt`, `schemaVersion`. Indexes `{companyKey:1,present:1}`, `{enabled:1,present:1}`.
- `gps_offline_check_executions`: `_id` idempotency key; `source`, requested scope/count, `running|completed|partial|failed`, timestamps and aggregate counts. Index `{source:1,startedAt:-1}`; no TTL.
- `gps_offline_check_outcomes`: execution/vehicle snapshot, `reporting|delayed|missing|invalid|failure`, supported observation/error. Unique `{executionId:1,vehicleId:1}`; index `{executionId:1}`; no TTL.
- `gps_offline_responses`: `_id=inboundMessageId`, candidate inquiry snapshot, `matched|unrelated|undecidable|retryable`, classifier version/attempts, validated incident IDs. Index `{incidentIds:1,receivedAt:-1}`.
- `messages.processing`: durable stage, attempt, `nextAttemptAt`, lease owner/expiry; index `{processing.status:1,processing.nextAttemptAt:1}`.

New collections use JSON-schema validators and BSON dates. Catalog sync upserts every valid vehicle with `$setOnInsert: {enabled:false}` and marks unseen entries `present:false`; it never overwrites membership. Migration reads distinct normalized `gps_company_contacts.vehiclePlates`, requires exactly 87 and unique catalog resolution, inserts those enabled before default-disabled catalog upserts, then writes `_id=legacy-87-v1` to `gps_offline_monitoring_migrations`. Registry mutations/cron remain gated until that marker exists; retries preserve inserted choices. Cron selects every conflict-free `enabled:true` record even if its last catalog snapshot is absent; manual targets must be present.

## Data Flow

```text
Cron -> sync catalog -> enabled registry ----+
                                             +-> start execution -> batch reports
Manual -> sync+validate companies/vehicles -+      -> upsert outcomes -> reconcile valid observations
                                                    -> finalize completed/partial/failed
```

Missing/invalid/failure outcomes never resolve incidents. Total source failure skips reconciliation; partial success reconciles only supported observations. Disabling membership never touches incidents.

```text
Meta webhook -> verify -> insert message+pending stage -> 200
                    `-> after() wake-up / retry cron -> lease -> candidate resolver
                         -> Gemini structured decision -> backend validation+response persist
                         -> matched: done, no chatbot
                         -> unrelated: durable chatbot stage
                         -> unavailable/malformed: retry; ambiguous: review-required, no chatbot
```

Candidates come only from accepted inquiries actually sent to the normalized sender: quoted `contextMessageId` selects exactly one; otherwise active unanswered inquiries are supplied as separate envelopes. The classifier may select incidents only within one envelope (or all its incidents); backend rejects stale/non-candidate IDs.

## API and UI Contracts

- `GET /api/offline-board/catalog`: synchronizes and returns all companies plus vehicles/membership.
- `PATCH /api/offline-board/membership`: `{vehicleId, enabled}`; server validates a present, conflict-free vehicle.
- `POST /api/offline-board/checks`: `{operatorId, companyKeys: string[], vehicles: Array<{vehicleId:string, companyKey:string}>}` plus `Idempotency-Key`. Company keys expand current vehicles; each individual pair is validated against the current catalog. Empty, stale, unknown, or mismatched targets atomically reject the request; company/vehicle overlap is deduplicated before execution.
- Cron uses the same orchestrator with `cron:<scheduled-slot>` identity. Existing incident/review/authorize contracts remain.

Split `operator-board.tsx` into a container plus `MonitoringCatalog`, `ManualCheckSelection`, `CheckFeedback`, and `IncidentTable`; separate automatic and temporary checkbox state.

## File Changes

| Files | Change |
|---|---|
| `lib/offline-monitoring/{registry-store,catalog-service,check-service,check-history-store,response-router,response-classifier,inbound-job-store}.ts` | Create focused domain/application/infrastructure units. |
| `app/api/offline-board/{catalog,membership,checks}/route.ts`, `app/api/cron/inbound-processing/route.ts` | Create thin adapters. |
| `lib/offline-monitoring/{scanner,daily-job,incident-review-store}.ts`, `lib/whatsapp-auto-reply.ts`, `app/api/whatsapp/webhook/route.ts`, `vercel.json` | Switch orchestration, reads, and durable draining. |
| `app/retrasados/operator-board.tsx`, `app/retrasados/components/*` | Reduce container and create focused panels/table. |
| `lib/offline-monitoring/customer-reply-match.ts`, `app/api/offline-board/scan/route.ts` | Delete after cutover. |

## Testing Strategy

Strict TDD: unit tests for identity, expansion, outcomes, candidate validation, and UI state; Mongo integration tests for indexes, migration/retry/leases and idempotent writes; route/webhook contract tests; E2E cron/manual partial failures, duplicate webhook, Gemini outage, matched/unrelated isolation. Finish with `npm test`, `npm run lint`, and `npm run build`.

## Migration / Rollout

Deploy additive stores/routes first, run and verify the 87-record migration, then switch UI/cron, then enable durable reply routing. Roll back application traffic to legacy paths without deleting new records; never reverse membership/history writes. Authentication remains a production exposure blocker, as scoped by the proposal.

## Open Questions

None.
