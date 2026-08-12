## Exploration: redesign-offline-monitoring

### Current State

`/retrasados` is salvageable, but three concepts are currently coupled:

1. **Monitoring scope is inferred from contacts.** `scanner.ts` only checks vehicles selected through `gps_company_contacts`; a contact is simultaneously the notification destination and the source of cron eligibility.
2. **The legacy manual scan is the wrong interaction.** The board loads companies only after clicking “Traer empresas”, and `POST /api/offline-board/scan` scans every vehicle of one company through “Escanear esta empresa”. The target flow replaces those controls: companies load automatically; selecting a company reveals its vehicles; automatic cron membership is persisted per vehicle; and a separate temporary selection of vehicles or whole companies can be checked immediately.
3. **Replies are inferred at read time from general chat messages.** `incident-review-store.ts` reads the shared `messages` collection and `customer-reply-match.ts` assigns an exact quoted reply to a notification, or any context-free message from the same phone within two hours to the latest notification. Because one notification may batch up to 10 incidents, the same inferred reply is displayed on every row in that batch. Gemini is not involved.

The webhook deduplicates and stores inbound messages, then sends every new text message to the general chatbot through `after()`. There is no offline-inquiry routing step, dedicated response record, or durable classification state. The completed `retrasados-operator-board` change correctly added operator review, authorization, recheck, audit, and dispatch gates, but its specs model authorization on an incident—not a durable vehicle monitoring preference—and do not define semantic reply attribution.

Authoritative target behavior for downstream phases:

- The board MUST load all companies automatically; the operator does not request the company catalog manually.
- Selecting a company MUST show that company's vehicles.
- Each vehicle MUST be independently included in or excluded from the persistent automatic cron control list.
- Independently, the operator MUST be able to select individual vehicles or whole companies and trigger an immediate manual check. This selection is request-local and MUST NOT alter automatic cron membership.
- The legacy “Traer empresas” / “Escanear esta empresa” interaction is replaced, not preserved.
- Contact configuration remains required only for notification delivery, never to decide which vehicles are checked.

### Affected Areas

- `lib/offline-monitoring/scanner.ts` — replace contact-derived eligibility with an explicit vehicle selection input shared by cron and manual checks.
- `lib/offline-monitoring/company-contact-store.ts` — stop using `vehicleSource` / `vehiclePlates` as monitoring scope; retain contact and delivery concerns.
- `lib/offline-monitoring/company-scan-service.ts` — already fetches and groups the complete Cybermapa catalog; reuse its catalog logic while replacing the legacy company-scan operation with a validated immediate-check selection supporting vehicles and whole companies.
- `lib/offline-monitoring/incident-store.ts` — keep incident reconciliation and active-incident uniqueness; incidents remain scan results, not monitoring configuration.
- `lib/offline-monitoring/notification-planner.ts` and `notification-store.ts` — preserve company batching and idempotency, but expose notification/incident candidates needed for reply classification.
- `lib/offline-monitoring/customer-reply-match.ts` — remove the two-hour heuristic from the board path; replace it with candidate resolution plus AI classification.
- `lib/offline-monitoring/incident-review-store.ts` and `operator-board-service.ts` — read persisted, validated offline responses rather than deriving them from general messages.
- `lib/offline-monitoring/daily-job.ts` and `app/api/cron/offline-vehicles/route.ts` — cron loads the persistent monitoring registry, scans only enabled vehicles, then retains the existing authorized-only dispatch path.
- `app/api/offline-board/companies/route.ts` and new/changed board routes — automatically provide the company/vehicle catalog, persist automatic selections, and accept ephemeral immediate-check selections of vehicles or companies.
- `app/retrasados/operator-board.tsx` — split catalog/filtering, automatic-monitoring selection, manual-review selection, and delayed-incident review into focused UI components/hooks.
- `app/api/whatsapp/webhook/route.ts` and `lib/whatsapp-auto-reply.ts` — route inbound text through offline-response classification before general conversation handling.
- `lib/gemini.ts` — do not add more responsibility to this already broad module; create a dedicated structured classifier adapter/use case instead.
- `tests/offline-*.test.mjs` and webhook tests — update contact-driven scanner expectations and add selection, subset validation, routing, ambiguity, AI failure, idempotency, and cross-domain isolation tests.
- `openspec/changes/retrasados-operator-board/specs/*` — treat as historical behavior. The new delta specs must explicitly supersede incident authorization as “monitoring selection” and preserve still-valid review/audit/notification guarantees.

### Approaches

1. **Dedicated monitoring registry and shared scan use case (recommended)** — persist one record per `system + plate` with enabled state and a company snapshot; cron loads that registry, while an immediate manual check expands selected companies and vehicles into explicit, server-validated vehicle identities before calling the same scan service. Contacts remain a separate delivery concern.
   - Pros: clear domain boundaries; persistent and ephemeral selections cannot leak into each other; reuses Cybermapa batching, normalization, reconciliation, notification idempotency, and existing tests.
   - Cons: requires a new collection, migration/compatibility rules for current contact-based selections, and changes across scanner/API/UI tests.
   - Effort: High

2. **Repurpose `gps_company_contacts.vehiclePlates`** — let the existing manual plate list become the cron checklist and pass temporary plate arrays to the current company scan.
   - Pros: fewer files and no new collection.
   - Cons: preserves the root architectural error: deleting/disabling a phone contact changes monitoring; companies without contacts cannot be monitored cleanly; one record owns unrelated delivery and monitoring lifecycles.
   - Effort: Medium

3. **Rewrite the offline subsystem in a new project/module** — replace incidents, dispatch, board, and webhook integration together.
   - Pros: maximum structural freedom.
   - Cons: discards working normalization, reconciliation, authorization, batching, idempotency, audit, and TDD seams; greatly increases regression and migration risk without solving uncertain product rules first.
   - Effort: Very High

For inbound messages, the recommended complement to approach 1 is a **dedicated offline-response router**:

- Resolve candidates deterministically from normalized sender phone, accepted/sent offline notifications, optional `contextMessageId`, notification age, and their incident IDs.
- Ask a dedicated Gemini classifier for structured output such as `matched | unrelated | ambiguous`, with only candidate incident IDs/plates and inquiry context—not unrestricted database identifiers.
- Validate every returned incident against the candidate set and reject invalid, ambiguous, multi-target, stale, or malformed output.
- Persist an idempotent offline-response record keyed by inbound WhatsApp message ID and linked to the validated incident/notification. Only `matched` messages appear in Retrasados.
- Do not attach a matched response to the general conversation or generate the normal chatbot reply. Unrelated messages continue to the chatbot. Classification failure fails closed for offline attribution and must be observable/retryable; it must never guess an incident.

This routing must happen at webhook processing time, not whenever the board is read. Read-time AI would be non-deterministic, expensive, repeatedly reclassify old messages, and keep the current cross-domain coupling.

### Recommendation

Keep the current project and incrementally replace the incorrect boundaries. Introduce a dedicated vehicle-monitoring registry, a catalog query that loads companies automatically and exposes the selected company's vehicles, and one explicit scan use case accepting a validated vehicle subset. Use persisted registry entries for cron and request-local vehicle/company selections for immediate manual checks. Do not store temporary selections, and remove the legacy load/scan buttons rather than adapting them.

Then insert a dedicated offline-response router before the general chatbot. Gemini classifies; the backend owns candidate selection, validation, idempotency, persistence, and fail-closed behavior. Preserve the existing incident reconciliation, operator audit, authorized-only notification dispatch, 10-vehicle batching, and notification reservation machinery unless later specs intentionally change them.

Use strict TDD in vertical slices: monitoring registry → catalog and selection APIs → shared scanner/cron → board UI → inbound candidate resolver → AI classifier contract → webhook routing and persisted response read model. This change will likely exceed the 400-line review budget and should be planned as chained work units.

### Risks

- Existing contact-based manual/platform selections need an explicit compatibility or one-time migration rule; silently enabling every known vehicle would be unsafe and expensive.
- Plate is currently the incident identity. Plate reuse, duplicate plates across companies, or a vehicle moving companies can corrupt registry ownership unless catalog identity rules are specified; a stable Cybermapa identifier should be evaluated.
- A batched WhatsApp inquiry can mention multiple vehicles. Generic replies such as “they are all in the workshop” are inherently ambiguous unless multi-incident attribution is explicitly supported; fail closed by default.
- The webhook currently uses non-durable `after()` work. Classification and chatbot routing can still be lost after persistence unless processing state and retries are designed; this is a production reliability requirement, not merely an AI prompt issue.
- Gemini outages or malformed structured output need a retry/unclassified path and operational visibility. Falling through silently to the general chatbot may produce an inappropriate response.
- Current board APIs have no real authentication. New selection and manual-scan mutations must not be considered production-safe until access control is addressed.
- Automatically fetching 4,763 vehicles was previously measured at about 1.3 seconds; returning the full catalog is feasible today but needs payload/cache/staleness limits rather than an unbounded assumption.

### Ready for Proposal

Yes. The proposal should establish the dedicated monitoring registry, automatic company/vehicle catalog flow, independent immediate manual checks, and inbound offline-response router as the architectural boundaries while explicitly preserving reusable incident/notification machinery.
