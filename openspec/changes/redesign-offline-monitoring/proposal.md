# Proposal: Redesign Offline Monitoring

## Intent

Replace contact-driven monitoring and heuristic reply matching with explicit vehicle selection, traceable checks, and reliable reply attribution.

## Scope

### In Scope
- Load companies automatically; selecting one shows its vehicles.
- Persist cron membership; immediate selections remain temporary.
- Idempotently enable the legacy 87 vehicles; all other existing/future vehicles default disabled.
- Persist every cron/manual execution, including empty runs, with source, lifecycle/timestamps, requested vehicles, and outcomes.
- Classify replies before chatbot handling; validate candidates and persist matches idempotently.
- Preserve reconciliation, active incidents, audit/review, authorization, batching, and idempotency.

### Out of Scope
- Application rewrite, provider replacement, authentication, or unrelated work.
- Removing active incidents when monitoring is disabled.
- Check-history TTL, cleanup, or retention; initially retain every record.

## Capabilities

### New Capabilities
- `offline-monitoring-registry`: Catalog, membership, migration.
- `offline-manual-check`: Temporary selections and shared reconciliation.
- `offline-check-history`: Execution and per-vehicle outcome history.
- `offline-response-routing`: AI classification, validation, persistence, chatbot isolation.

### Modified Capabilities
None; historical guarantees remain constraints.

## Approach

Create a registry independent of contacts. Cron reads enabled entries; manual selections expand into validated vehicles. Both invoke shared reconciliation and create an independent record tracking `cron|manual`, status/timestamps, requested set, and outcomes: normal/reporting, delayed, missing/invalid report, failure, or partial failure. It remains separate from incidents, notifications, and operator audit. Replace legacy controls with focused UI units.

Before chatbot handling, resolve candidates from sender and inquiry. A classifier returns structured matches within that envelope; the backend rejects invalid/ambiguous output and persists by inbound message ID. General replies may match every original incident; unrelated messages stay outside Retrasados.

## Affected Areas

- `lib/offline-monitoring/`: registry, history, checks, reply routing.
- `app/api/offline-board/`, `app/api/cron/offline-vehicles/`: selection/check APIs.
- `app/api/whatsapp/webhook/route.ts`: route before chatbot.
- `app/retrasados/`: replace controls and split UI.
- `tests/offline-*.test.mjs`: coverage.

## Risks

- Wrong migration: count assertion and idempotent upsert.
- Incomplete history: start/finalize lifecycle and preserve partial outcomes.
- AI misattribution/outage: candidate envelope, fail closed, retry visibility.
- Concurrency: stable identities and idempotency keys.
- Unauthenticated mutations: access control gates production exposure.

## Rollback Plan

Disable new cron/routing paths and restore prior UI/routes. Retain all records; migration remains rerunnable.

## Dependencies

- Cybermapa, MongoDB, Gemini, WhatsApp records, legacy selection.

## Success Criteria

- [ ] Cron checks only enabled vehicles; manual checks never alter membership.
- [ ] Migration enables exactly 87 legacy vehicles; all others remain disabled.
- [ ] Disabling monitoring never hides an unresolved active incident.
- [ ] Every run records source, lifecycle, requested set, and available outcomes, including empty/partial-failure runs.
- [ ] Only validated AI matches appear; general batch replies may map to all original incidents.
- [ ] TDD tests, lint, and build pass without regressions.
