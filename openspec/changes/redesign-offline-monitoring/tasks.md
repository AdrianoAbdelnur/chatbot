# Tasks: Redesign Offline Monitoring

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 3,800-5,200 additions/deletions across application code, tests, routes, UI, scripts, and documentation |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 13 dependency-ordered work units; keep every unit near or below 400 changed lines and split again if its measured diff exceeds the budget |
| Delivery strategy | ask-on-risk (risk decision resolved) |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

The maintainer selected **feature-branch-chain**. Implementation may proceed using the fixed branch/base plan below. The tracker PR from `feat/redesign-offline-monitoring` to `main` MUST remain draft/no-merge until the complete chain is integrated and verified.

### Suggested Work Units

| Unit | Goal | Likely PR | Estimated changed lines | Dependency / rollback boundary |
|------|------|-----------|-------------------------|--------------------------------|
| 0 | Safe Mongo integration-test harness and verification baseline | PR 1 | 180-280 | Independent first child; revert test/config/docs changes without affecting application behavior |
| 1 | Registry schema and stable vehicle identity | PR 2 | 300-390 | Depends on Unit 0 test infrastructure; additive collections/types only |
| 2 | Idempotent legacy-87 migration | PR 3 | 280-390 | Depends on Unit 1; rollback disables the migration gate but retains written membership |
| 3 | Catalog synchronization and membership APIs | PR 4 | 340-400 | Depends on Units 1-2; old scan UI/routes remain available |
| 4 | Durable execution and outcome history | PR 5 | 330-400 | Depends on Unit 0 harness; additive history only, with no existing behavior changes |
| 5 | Shared check orchestration | PR 6 | 360-400 | Depends on Units 1 and 4; not wired to cron/UI yet |
| 6 | Cron cutover to registry-backed checks | PR 7 | 250-360 | Depends on Units 2, 3, and 5; rollback restores old daily-job wiring without deleting history |
| 7 | Manual-check API and temporary selection model | PR 8 | 330-400 | Depends on Units 3 and 5; additive route, independently removable |
| 8 | Focused catalog/manual-check UI | PR 9 | 350-400 | Depends on Units 3 and 7; incident table remains behaviorally unchanged |
| 9 | Durable inbound jobs, leases, and retry drain | PR 10 | 360-400 | Depends on Unit 0 harness; additive worker infrastructure, with webhook rollback available |
| 10 | AI classifier, validator, router, and response persistence | PR 11 | 370-400 | Depends on Unit 9; feature remains behind the new processing stage |
| 11 | Board response read model and inbound cutover | PR 12 | 330-400 | Depends on Units 9-10; rollback restores legacy heuristic/read path while retaining new records |
| 12 | Legacy removal, end-to-end verification, and operational docs | PR 13 | 260-380 | Depends on all prior units; deletion is the final, separately reversible cutover boundary |

Each work unit is a reviewable deliverable, keeps its tests and documentation beside its behavior, and MUST end with a measured `git diff --stat`. If a unit exceeds 400 changed lines, split it before opening its PR rather than moving tests into a later PR.

### Feature Branch Chain Plan

| Boundary | Branch | PR base | Merge rule |
|----------|--------|---------|------------|
| Tracker/integration | `feat/redesign-offline-monitoring` | `main` | Draft/no-merge until all 13 work units are integrated and verified |
| Work Unit 0 | `test/offline-monitoring-integration-harness` | `feat/redesign-offline-monitoring` | First child; merge into the tracker after focused review |
| Work Unit 1 | `feat/offline-monitoring-registry` | `test/offline-monitoring-integration-harness` | Merge into its immediate parent only |
| Work Unit 2 | `feat/offline-monitoring-legacy-migration` | `feat/offline-monitoring-registry` | Merge into its immediate parent only |
| Work Unit 3 | `feat/offline-monitoring-catalog-membership` | `feat/offline-monitoring-legacy-migration` | Merge into its immediate parent only |
| Work Unit 4 | `feat/offline-check-history` | `feat/offline-monitoring-catalog-membership` | Merge into its immediate parent only |
| Work Unit 5 | `feat/offline-check-orchestration` | `feat/offline-check-history` | Merge into its immediate parent only |
| Work Unit 6 | `feat/offline-monitoring-cron-cutover` | `feat/offline-check-orchestration` | Merge into its immediate parent only |
| Work Unit 7 | `feat/offline-manual-checks` | `feat/offline-monitoring-cron-cutover` | Merge into its immediate parent only |
| Work Unit 8 | `feat/offline-monitoring-board-ui` | `feat/offline-manual-checks` | Merge into its immediate parent only |
| Work Unit 9 | `feat/offline-inbound-jobs` | `feat/offline-monitoring-board-ui` | Merge into its immediate parent only |
| Work Unit 10 | `feat/offline-response-routing` | `feat/offline-inbound-jobs` | Merge into its immediate parent only |
| Work Unit 11 | `feat/offline-response-cutover` | `feat/offline-response-routing` | Merge into its immediate parent only |
| Work Unit 12 | `feat/offline-monitoring-finalize` | `feat/offline-response-cutover` | Merge into its immediate parent only; then verify the tracker before promoting it to `main` |

Every child PR MUST show only its work unit. If earlier work appears in a child diff, fix the PR base or rebase before review. No work-unit branch targets `main` directly.

## Traceability Legend

- **REG** — `offline-monitoring-registry/spec.md`
- **MAN** — `offline-manual-check/spec.md`
- **HIS** — `offline-check-history/spec.md`
- **RESP** — `offline-response-routing/spec.md`
- **HIST** — preserved contracts from `retrasados-operator-board` (incident reconciliation, review/audit, authorization gate, batching, and send idempotency)

## Phase 0: Apply Gates and Test Infrastructure — Work Unit 0

- [ ] 0.1 Apply the selected `feature-branch-chain` strategy exactly as recorded above; verify the tracker targets `main` as draft/no-merge, Work Unit 0 targets the tracker, Work Unit 1 targets Work Unit 0, and every later work-unit PR targets its immediate predecessor. Never mix strategies or create a direct-to-main work-unit PR. [Review guard]
- [ ] 0.2 Inspect `git status`, preserve all pre-existing user changes, and record a baseline by running `npm test`, `npm run lint`, and `npm run build`. **Verify:** failures are documented before RED tests are introduced; no unrelated file is modified. [Project invariant]
- [ ] 0.3 Add an opt-in Mongo integration-test harness under `tests/integration/` that connects only through a dedicated test URI, creates a random database whose name has a hard-coded test prefix, and refuses cleanup outside that prefix. Add a separate `test:integration` script; do not make ordinary unit tests contact MongoDB. **Verify:** a harness self-test proves isolated database creation/cleanup and proves the destructive guard rejects a non-test database name. [REG, HIS, RESP]
- [ ] 0.4 Document the test-only Mongo prerequisite without exposing credentials and wire CI/local verification to run the integration suite when the test URI is available. **Verify:** a missing URI produces an explicit integration-test prerequisite result rather than silently claiming Mongo behavior was tested. [REG, HIS, RESP]

## Phase 1: Registry Schema and Vehicle Identity — Work Unit 1

- [ ] 1.1 **RED — identity rules:** create `tests/offline-monitoring-registry-identity.test.mjs` with failing cases for `_id = CYBERMAPA:<normalizedPlate>`, duplicate normalized plates, changed non-empty `gpsId`, company moves, missing plate, and conflict fail-closed behavior. **Verify RED:** run only this file and confirm failures are caused by missing identity/catalog behavior. [REG: persistent membership; migration]
- [ ] 1.2 **GREEN — focused types and identity policy:** extend `lib/offline-monitoring/types.ts` only with shared public registry shapes and create a small pure identity/catalog policy module. Company moves MUST preserve `_id` and membership; duplicate plates or changed non-empty `gpsId` MUST yield `identityConflict`. **Verify GREEN:** the identity test passes. [REG: persistent membership]
- [ ] 1.3 **RED — Mongo schema/index contract:** create `tests/integration/offline-monitoring-registry-store.test.mjs` covering the `gps_offline_monitoring_registry` JSON-schema validator, BSON dates, `{companyKey:1,present:1}` and `{enabled:1,present:1}` indexes, unique `_id`, and rejection of malformed documents. [REG: catalog; persistent membership]
- [ ] 1.4 **GREEN — registry store:** create `lib/offline-monitoring/registry-store.ts` with memoized schema/index installation plus narrow functions for catalog upsert, unseen marking, list-by-company, list-enabled, lookup, and compare-and-set membership. `$setOnInsert` MUST default `enabled:false`; catalog refresh MUST never overwrite an existing membership choice. **Verify GREEN:** registry integration tests pass against an isolated database. [REG: all requirements]
- [ ] 1.5 **REFACTOR:** keep normalization/identity pure and Mongo mapping private to the store; remove duplicated plate/company normalization introduced during GREEN. **Verify:** identity and registry integration tests remain green, then run `npm test`, `npm run lint`, and `npm run build`. [REG]

## Phase 2: Idempotent Legacy-87 Migration — Work Unit 2

- [ ] 2.1 **RED — migration service:** create `tests/offline-monitoring-registry-migration.test.mjs` with failing injected-dependency cases for exactly 87 distinct normalized legacy plates, count mismatch, unresolved catalog identity, duplicate/conflicting catalog identities, repeated migration, and an operator choice changed after initialization. Assert the marker is never written on invalid input. [REG: migration preserves legacy automatic scope]
- [ ] 2.2 **GREEN — migration orchestration:** create `lib/offline-monitoring/registry-migration.ts` that reads the authoritative distinct `gps_company_contacts.vehiclePlates`, validates exactly 87 unique catalog resolutions, initializes those memberships enabled without overwriting initialized records, and writes marker `_id=legacy-87-v1` only after successful initialization. Registry mutations and cron reads MUST expose a fail-closed `not_initialized` result until the marker exists. [REG: migration]
- [ ] 2.3 **RED — migration persistence/concurrency:** extend the registry integration suite to run the migration twice and concurrently, simulate interruption before marker creation, retry it, and prove one marker/one record per vehicle with post-initialization operator choices preserved. [REG: repeated migration]
- [ ] 2.4 **GREEN — idempotent persistence:** add the minimum migration-marker store functions and conditional updates needed for retries/concurrency. Do not add a destructive down-migration; rollback is application-path only. **Verify GREEN:** unit and Mongo integration migration tests pass. [REG: migration]
- [ ] 2.5 **REFACTOR and verify:** create a rerunnable operator script for the migration with a dry, count-only preflight and a safe summary that contains no secrets. Run targeted tests, full unit tests, lint, build, and the integration suite. Confirm exactly 87 would be enabled in the controlled fixture before any real database execution is authorized. [REG: migration]

## Phase 3: Catalog Synchronization and Membership — Work Unit 3

- [ ] 3.1 **RED — catalog sync:** create `tests/offline-monitoring-catalog-service.test.mjs` for automatic full-company discovery, per-company vehicle grouping, new vehicles default-disabled, unseen vehicles marked `present:false`, company moves preserving identity/membership, identity conflicts disabled from mutation/check selection, and contact changes having no effect. [REG: catalog; persistent membership]
- [ ] 3.2 **GREEN — catalog service:** create `lib/offline-monitoring/catalog-service.ts` to fetch all Cybermapa vehicles, apply the identity policy, upsert snapshots, mark unseen records, and return a sorted company/vehicle membership read model. It MUST NOT read contacts to decide membership. [REG: catalog; persistent membership]
- [ ] 3.3 **RED — catalog and membership route contracts:** create route tests for `GET /api/offline-board/catalog` and `PATCH /api/offline-board/membership`, covering automatic synchronization, complete companies, current vehicles only, `cache-control/no-store` behavior as applicable, malformed bodies, unknown/absent/conflicted vehicles, missing migration marker, and one-vehicle updates that leave all others unchanged. [REG: catalog; persistent membership]
- [ ] 3.4 **GREEN — thin adapters:** create `app/api/offline-board/catalog/route.ts` and `app/api/offline-board/membership/route.ts` using `runtime="nodejs"`, `dynamic="force-dynamic"`, manual input validation, safe response shapes, and the service/store seams. Never expose provider payloads or secrets. [REG: catalog; membership]
- [ ] 3.5 **RED/GREEN — membership concurrency:** add Mongo integration cases for two simultaneous updates to different vehicles and competing updates to one vehicle; implement conditional atomic updates so no unrelated membership is lost. Assert disabling membership leaves existing incident bytes unchanged. [REG: persistent membership; membership does not own incidents]
- [ ] 3.6 **REFACTOR and verify:** retire contact-derived membership logic only inside the new catalog path; do not cut over cron or remove legacy scan yet. Run targeted unit/route/integration tests, then full tests, lint, and build. [REG]

## Phase 4: Durable Check History — Work Unit 4

- [ ] 4.1 **RED — lifecycle and aggregate policy:** create `tests/offline-check-history.test.mjs` for stable execution identity, `running -> completed|partial|failed`, one outcome per distinct vehicle, aggregate counts, empty successful runs, duplicate targets, full-source failure, partial failures, completed retries, and interrupted-run resume. [HIS: every execution; bounded outcomes; failures; idempotency]
- [ ] 4.2 **GREEN — history types/policy:** add focused execution/outcome types and pure final-status/aggregate calculation. Enforce only `reporting|delayed|missing|invalid|failure` outcomes and never attach an observation to unsupported `missing|invalid|failure` data. [HIS: bounded outcomes; truthful failures]
- [ ] 4.3 **RED — history Mongo contract:** create `tests/integration/offline-check-history-store.test.mjs` for validators, BSON dates, header index `{source:1,startedAt:-1}`, unique `{executionId:1,vehicleId:1}`, `{executionId:1}`, idempotent start/upsert/finalize, resume after interruption, and concurrent duplicate outcome writes. Assert neither collection has a TTL index. [HIS: all requirements]
- [ ] 4.4 **GREEN — history store:** create `lib/offline-monitoring/check-history-store.ts` with separate `gps_offline_check_executions` and `gps_offline_check_outcomes` collections and narrow start/upsert/finalize/read operations. Finalization MUST derive counts from persisted distinct outcomes and MUST not embed unbounded outcomes in the execution header. [HIS: all requirements]
- [ ] 4.5 **REFACTOR and verify:** ensure incident, notification, membership, and audit stores do not import or delete history. Run targeted tests, Mongo integration tests, full tests, lint, and build. [HIS: independent ownership and retention]

## Phase 5: Shared Check Orchestration — Work Unit 5

- [ ] 5.1 **RED — outcome evaluation:** create `tests/offline-check-evaluation.test.mjs` for latest valid report selection, normal/delayed threshold evaluation, absent report as `missing`, target report with invalid/future timestamp as `invalid`, duplicate provider reports, and per-batch failure as `failure`. Use a fixed clock and assert each requested vehicle produces exactly one outcome. [HIS: bounded outcomes; failures]
- [ ] 5.2 **GREEN — pure evaluation:** extract the reusable report batching/indexing/evaluation logic from `scanner.ts` and `company-scan-service.ts` into a focused module consumed by the new use case. Preserve existing normalization and threshold semantics. [HIS; MAN: shared incident outcomes]
- [ ] 5.3 **RED — check use case:** create `tests/offline-check-service.test.mjs` for `runOfflineCheck`: persist `running` before Cybermapa calls; batch distinct targets once; store every outcome; reconcile only supported `reporting|delayed` observations; never resolve from missing/invalid/failure; finalize completed/partial/failed; preserve partial truth; and resume idempotently by execution ID. [HIS: all execution requirements; MAN: shared outcomes]
- [ ] 5.4 **GREEN — shared orchestrator:** create `lib/offline-monitoring/check-service.ts` with injected registry/source/history/reconciliation dependencies. Both cron and manual callers MUST supply a stable execution ID, source, requested-scope snapshot, and validated vehicle snapshots. Whole-source failure MUST persist failure outcomes for every requested vehicle and skip reconciliation. [HIS; MAN]
- [ ] 5.5 **RED/GREEN — reconciliation boundary:** add focused tests proving a valid normal observation resolves through existing reconciliation, a delayed observation creates/refreshes, and every unsupported outcome leaves incident state untouched; make only the minimal adapter change in `incident-store.ts` if required. [MAN: shared incident outcomes; REG: incident lifecycle independence]
- [ ] 5.6 **REFACTOR and verify:** make old scanner helpers delegate to the extracted evaluation during the additive period rather than maintaining two subtly different algorithms. Run targeted tests, all existing scanner/company-scan tests, full tests, lint, build, and Mongo integration tests. [HIST; HIS]

## Phase 6: Cron Cutover — Work Unit 6

- [ ] 6.1 **RED — enabled-target resolution:** add tests proving cron refuses to run before `legacy-87-v1`, selects every conflict-free `enabled:true` registry entry, excludes disabled/conflicted entries, and continues checking an enabled vehicle whose latest catalog snapshot is `present:false`. [REG: cron exactly enabled; migration]
- [ ] 6.2 **RED — deterministic cron identity:** extend daily-job/cron route tests for `cron:<scheduled-slot>` idempotency, duplicated delivery of the same slot, empty enabled set history, full/partial failure history, and `CRON_SECRET` rejection before any work. [HIS: every cron execution; idempotency]
- [ ] 6.3 **GREEN — daily-job cutover:** change `lib/offline-monitoring/daily-job.ts` and `app/api/cron/offline-vehicles/route.ts` to synchronize the catalog, assert migration completion, resolve enabled registry vehicles, and invoke `runOfflineCheck`. Preserve the existing authorized-only notification dispatch after a successful/partial check; a failed source MUST not fabricate reconciliation or dispatch new inquiries. [REG: cron; HIS; HIST]
- [ ] 6.4 **GREEN — compatibility response:** adapt the cron response to expose the new execution summary without reporting Meta acceptance as delivery. If an existing documented response field changes, preserve it during a deprecation window or explicitly update the agreed route contract before removal. [Project invariant]
- [ ] 6.5 **REFACTOR and verify:** remove contact ownership from the cron selection path but leave delivery contact lookup untouched. Run cron/daily-job/check tests, Mongo idempotency tests, full tests, lint, and build. Record a rollback check that restoring the old daily-job adapter does not delete registry/history records. [REG; HIS; HIST]

## Phase 7: Manual Check API — Work Unit 7

- [ ] 7.1 **RED — temporary target expansion:** create `tests/offline-manual-selection.test.mjs` for individual `{vehicleId, companyKey}` pairs, whole `companyKeys`, combined overlap deduplication, disabled vehicles, empty input, unknown/stale/not-present targets, vehicle/company mismatches, identity conflicts, and selection remaining request-local. Assert one invalid pair rejects the entire selection before any source/history/membership call. [MAN: selection; validation; immediate/non-persistent]
- [ ] 7.2 **GREEN — selection service:** create a pure/application-level target expansion function backed by current catalog snapshots. Whole companies MUST expand to all current vehicles; every individual `{vehicleId, companyKey}` MUST match the current catalog; overlap MUST deduplicate by stable vehicle ID. Return a complete validated set or reject atomically, and never write membership. **Verify GREEN:** the temporary-selection tests pass. [MAN: selection; validation]
- [ ] 7.3 **RED — approved route contract:** create route tests for `POST /api/offline-board/checks` requiring `Idempotency-Key` and the exact body `{operatorId, companyKeys: string[], vehicles: Array<{vehicleId:string, companyKey:string}>}`. Cover operator validation, malformed arrays/pairs, empty selection, unknown/stale/mismatched targets, company/vehicle overlap, duplicate request replay, immediate execution summary, total rejection before source/history work, and zero membership/notification writes. [MAN: all requirements; HIS: idempotency]
- [ ] 7.4 **GREEN — manual-check adapter:** create `app/api/offline-board/checks/route.ts`; synchronize catalog, validate the entire approved payload atomically, derive a stable manual execution ID from the idempotency key, expand/deduplicate the targets, and call `runOfflineCheck(source:"manual")`. Return a safe execution summary and map validation/upstream failures consistently. **Verify GREEN:** route-contract tests pass. [MAN; HIS]
- [ ] 7.5 **RED/GREEN — route-level Mongo contract:** integration-test a manual replay, whole-company expansion, overlapping company/vehicle targets, mismatched `{vehicleId, companyKey}`, disabled individual vehicle, failed source, and verify membership bytes remain unchanged while execution/outcome history is retained. Implement only the persistence/wiring needed to pass. [MAN; HIS]
- [ ] 7.6 **REFACTOR and verify:** keep authorization and notification dispatch out of this route. Run targeted unit/route/integration tests, full tests, lint, and build. [MAN: notification gates]

## Phase 8: Focused Board UI — Work Unit 8

- [ ] 8.1 **RED — UI state model:** create `tests/offline-manual-selection-state.test.mjs` around pure state helpers for separate automatic membership and temporary manual selection, company selection expansion, individual toggles, overlap deduplication, clearing temporary selection after completion, and preserving unsent membership edits. [REG: membership; MAN: temporary selection]
- [ ] 8.2 **GREEN — focused UI modules:** create `app/retrasados/components/MonitoringCatalog.tsx`, `ManualCheckSelection.tsx`, `CheckFeedback.tsx`, and `IncidentTable.tsx`, plus a small pure selection-state module. Keep each component responsible for one concern and use complete literal Tailwind classes. [REG: catalog; MAN: selection; maintainability]
- [ ] 8.3 **GREEN — container wiring:** reduce `app/retrasados/operator-board.tsx` to data fetching/orchestration. Load `/api/offline-board/catalog` automatically on mount; select a company to show its current vehicles; wire persistent automatic checkboxes to `PATCH /membership`; wire distinct temporary checkboxes/company actions to `POST /checks` with a new idempotency key and `{operatorId, companyKeys, vehicles:[{vehicleId,companyKey}]}` per operator action. [REG; MAN]
- [ ] 8.4 **GREEN — truthful feedback:** show catalog failures without fabricated options and manual results from persisted execution summaries, including normal, delayed, missing, invalid, partial, and failed outcomes. A manual check MUST NOT imply that WhatsApp was sent. [REG: catalog failure; HIS; MAN]
- [ ] 8.5 **REFACTOR:** remove the legacy “Traer empresas / Escanear esta empresa” controls from the rendered UI while keeping incident review/authorize/re-check behavior intact. Keep customer replies read-only in the incident table; never prefill an editable operator comment from an unvalidated inbound message. [RESP; HIST]
- [ ] 8.6 **Verify:** run UI-state tests, full tests, lint, and build; use the local browser to verify automatic company loading, vehicle filtering, independent checkbox sets, disabled-new-vehicle default, manual submission, responsive layout, labels, keyboard access, and error states. [REG; MAN]

## Phase 9: Durable Inbound Jobs and Leases — Work Unit 9

- [ ] 9.1 **RED — processing state machine:** create `tests/offline-inbound-job-policy.test.mjs` for `pending|leased|retryable|review_required|chatbot_pending|completed`, due-time calculation, bounded attempts/backoff, expired lease reclamation, owner-only completion, and no second live lease. [RESP: unavailable/ambiguous handling; idempotency]
- [ ] 9.2 **GREEN — job policy/types:** add the smallest durable processing-state model to the existing message document contract; keep transition validation pure and independent of Next.js/Meta/Gemini. [RESP]
- [ ] 9.3 **RED — Mongo lease concurrency:** create `tests/integration/offline-inbound-job-store.test.mjs` proving required processing index `{processing.status:1,processing.nextAttemptAt:1}`, atomic claim, competing workers, expired lease recovery, retry scheduling, idempotent completion, and duplicate webhook insert preserving one job. [RESP: retryable; idempotency]
- [ ] 9.4 **GREEN — inbound job store:** create `lib/offline-monitoring/inbound-job-store.ts` using atomic `findOneAndUpdate` leases and owner-checked transitions. Add schema/index installation to the message store without weakening existing message validation/deduplication. [RESP]
- [ ] 9.5 **RED/GREEN — webhook persistence boundary:** extend webhook contract tests to prove signed inbound messages are persisted with `pending` processing before `200`, duplicates do not reset completed work, invalid signatures enqueue nothing, and `after()` only wakes a durable drain. Make the minimal webhook/store changes; do not route/classify yet. [RESP; security invariant]
- [ ] 9.6 **GREEN — retry drain adapter:** create a `CRON_SECRET`-protected `app/api/cron/inbound-processing/route.ts` plus a reusable drain service; update `vercel.json` only with the approved schedule. Concurrent HTTP/`after()` drains MUST be safe through leases. [RESP]
- [ ] 9.7 **REFACTOR and verify:** ensure no inbound correctness depends on process memory or `after()` completion. Run policy, webhook, Mongo concurrency, full tests, lint, and build. [RESP]

## Phase 10: Classifier, Validation, Routing, and Persistence — Work Unit 10

- [ ] 10.1 **RED — candidate resolver:** create `tests/offline-response-candidates.test.mjs` for normalized sender matching, inquiries actually accepted by Meta, exact quoted `contextMessageId`, separate active unanswered inquiry envelopes when unquoted, no eligible inquiry, stale/resolved incidents, and no widening across inquiries. [RESP: original inquiry candidates; backend validation]
- [ ] 10.2 **GREEN — candidate resolver/store reads:** add focused read functions that return bounded inquiry envelopes containing only safe incident IDs/plates and original inquiry identifiers. Do not pass unrelated conversation, secrets, or customer/vehicle data beyond the minimum classifier context. [RESP; privacy invariant]
- [ ] 10.3 **RED — structured classifier/validator:** create `tests/offline-response-classifier.test.mjs` for one-vehicle matches, coherent all-vehicle matches within one envelope, unrelated, undecidable, malformed Gemini output, non-candidate IDs, mixed-envelope targets, contradictions, and unavailable Gemini. [RESP: classification; fail closed]
- [ ] 10.4 **GREEN — classifier and backend validator:** create `lib/offline-monitoring/response-classifier.ts` with a versioned structured Gemini contract and a separate pure validator. Gemini may classify; only the validator may authorize incident IDs for persistence. Invalid/malformed/unavailable results MUST be retryable, while genuine ambiguity MUST become review-required. [RESP]
- [ ] 10.5 **RED — response persistence:** create `tests/integration/offline-response-store.test.mjs` for collection validator/index `{incidentIds:1,receivedAt:-1}`, `_id=inboundMessageId`, single/all-incident match persistence, duplicate processing, immutable attribution on retry, unrelated/undecidable/retryable decisions, and no non-candidate incident association. [RESP: valid matches idempotent]
- [ ] 10.6 **GREEN — response store/router:** create `lib/offline-monitoring/response-store.ts` and `response-router.ts`. Persist each stage before branching: matched -> completed/no chatbot; unrelated -> `chatbot_pending`; unavailable/malformed -> retryable; ambiguous -> review-required/no chatbot. [RESP: routing isolation]
- [ ] 10.7 **REFACTOR and verify:** keep candidate lookup, Gemini transport, validation, persistence, and job transition in separate modules with injected dependencies. Run focused tests, Mongo integration tests, full tests, lint, and build. [RESP]

## Phase 11: Chatbot Isolation, Board Read Model, and Cutover — Work Unit 11

- [ ] 11.1 **RED — durable router-to-chatbot flow:** create tests proving matched messages never invoke `processAutomaticReply`, confidently unrelated messages invoke it once through `chatbot_pending`, undecided/retryable/review-required messages invoke it zero times, and a crash/retry does not duplicate a completed chatbot stage. [RESP: chatbot isolation]
- [ ] 11.2 **GREEN — drain orchestration:** wire the inbound drain to resolve candidates, classify/validate/persist, and only then invoke the existing chatbot for `chatbot_pending`. Persist terminal/retry state around every branch and preserve human-handoff handling through an explicit non-text/router policy. [RESP; existing chatbot contracts]
- [ ] 11.3 **RED — board response read model:** replace heuristic expectations in `tests/offline-board-row.test.mjs`/new service tests with cases where only validated `gps_offline_responses.status="matched"` records appear, a single match appears on one incident, an all-inquiry match appears on each validated incident, and unrelated/undecidable/retryable records appear nowhere. [RESP: persistence and board visibility]
- [ ] 11.4 **GREEN — read-model cutover:** change `incident-review-store.ts`, `operator-board-service.ts`, `board-row.ts`, and shared types to join the dedicated response store rather than scanning arbitrary inbound messages by sender/time. Render matched customer responses as immutable evidence separate from the operator comment field. [RESP]
- [ ] 11.5 **RED/GREEN — webhook/worker contracts:** add end-to-end route tests for duplicate webhook delivery, exact quoted reply, coherent batch reply, unrelated customer question, ambiguous reply, Gemini outage followed by retry, expired lease, and worker restart. Implement the minimum route/service wiring to pass. [RESP: all requirements]
- [ ] 11.6 **REFACTOR and verify:** remove direct `after(() => processAutomaticReply(...))` behavior; `after()` may only request a durable drain. Run webhook, chatbot, routing, board, Mongo concurrency, full tests, lint, and build. [RESP]

## Phase 12: Legacy Removal, End-to-End Verification, and Rollback — Work Unit 12

- [ ] 12.1 **RED — cutover regression tests:** add tests that fail while cron still derives monitored vehicles from contacts, the board still calls legacy `/companies` or `/scan`, or board replies still call `matchCustomerRepliesToNotifications`. [REG; MAN; RESP]
- [ ] 12.2 **GREEN — remove legacy paths:** delete `lib/offline-monitoring/customer-reply-match.ts`, `app/api/offline-board/scan/route.ts`, and obsolete heuristic/scan UI code after all new paths are proven. Remove or reduce `company-scan-service.ts` and old scanner entry points only when no supported script/route imports them; update affected tests in the same work unit. [REG; MAN; RESP]
- [ ] 12.3 **GREEN — script/documentation cutover:** update `scripts/check-offline-vehicles.ts`, README route/flow documentation, and operational instructions to use registry-backed checks/history. Document migration preflight, manual idempotency, durable inbound drain, retry/review states, no-TTL initial retention, and safe rollback. [REG; MAN; HIS; RESP]
- [ ] 12.4 **Integration verification:** run Mongo contract/concurrency suites for validators, indexes, exact-87 migration, membership races, execution/outcome idempotency, lease races, and response deduplication. Record the isolated database name and cleanup result, never credentials. [REG; HIS; RESP]
- [ ] 12.5 **End-to-end verification:** exercise catalog load -> membership update -> cron check -> stored history -> incident reconciliation; manual company/vehicle overlap -> one outcome per vehicle -> no membership/send mutation; inquiry -> reply classification -> validated board response/chatbot isolation. Include full-source and partial-source failures. [REG; MAN; HIS; RESP]
- [ ] 12.6 **UI verification:** use the local browser against a non-production database to validate automatic companies, per-company vehicles, independent automatic/manual selections, immediate checks, persisted outcomes, incident continuity after disabling monitoring, and validated reply display. Capture discrepancies as failing tests before fixes. [REG; MAN; HIS; RESP]
- [ ] 12.7 **Final quality gate:** review the complete diff against proposal/design/specs and confirm no unrelated refactor, secret exposure, TTL, automatic notification bypass, or delivery-status overclaim. Run `npm test`, `npm run test:integration`, `npm run lint`, `npm run build`, and `git diff --check`; report every result and anything not verified. [All]
- [ ] 12.8 **Rollback rehearsal:** prove feature-path rollback can restore the legacy cron/UI/router adapters without deleting registry, migration marker, history, inbound jobs, or classified responses. Confirm new stores remain backward-inert and migration remains rerunnable. [Proposal rollback]

## Specification Traceability Matrix

| Requirement | Primary tasks |
|-------------|---------------|
| REG — Catalog available automatically | 3.1-3.4, 8.3-8.6 |
| REG — Persistent per-vehicle membership independent of contacts | 1.1-1.5, 3.1-3.6, 8.1-8.3 |
| REG — Cron checks exactly enabled vehicles | 6.1-6.5 |
| REG — Exactly-87 idempotent migration/new vehicles disabled | 2.1-2.5, 3.1-3.2 |
| REG — Membership does not own incident lifecycle | 3.5, 5.5, 12.5 |
| MAN — Vehicle/company selection and deduplication | 7.1-7.5, 8.1-8.3 |
| MAN — Immediate request-local check, no membership mutation | 7.1-7.6, 8.3-8.4 |
| MAN — Server validation and all-or-nothing rejection | 7.1-7.5 |
| MAN — Shared reconciliation and notification gates | 5.3-5.5, 7.4-7.6 |
| MAN — Source failure does not corrupt state | 5.3-5.5, 7.3-7.5 |
| HIS — Every execution recorded | 4.1-4.5, 5.3-5.4, 6.2-6.3 |
| HIS — One bounded outcome per requested vehicle | 4.1-4.5, 5.1-5.4 |
| HIS — Truthful partial/full failure | 4.1-4.5, 5.1-5.4, 12.5 |
| HIS — Idempotent execution/resume | 4.1-4.5, 6.2, 7.4-7.6 |
| HIS — Independent ownership/no TTL | 4.3-4.5, 12.3-12.4 |
| RESP — Original inquiry candidates only | 10.1-10.4 |
| RESP — Backend validation fails closed | 10.3-10.7 |
| RESP — Idempotent validated persistence | 10.5-10.7, 11.3-11.5 |
| RESP — Chatbot isolation | 10.6, 11.1-11.6 |

## Completion Rule

No task is complete after GREEN alone. Mark a task/work unit complete only after its RED failure was observed, GREEN behavior is passing, REFACTOR preserved behavior, the relevant Mongo/route/contract tests passed, and the unit-level `npm test`, `npm run lint`, and `npm run build` results were recorded. The change is ready for `sdd-verify` only after Phase 12 and after every applicable spec row above has executable evidence.
