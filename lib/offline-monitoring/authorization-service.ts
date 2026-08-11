import { appendOfflineIncidentAuditEvent } from "./incident-audit-store.ts";
import { markIncidentsAuthorized } from "./incident-review-store.ts";
import { runOfflineNotificationDispatch } from "./notification-service.ts";
import { findOperatorById } from "./operator-directory-store.ts";
import type { SafeDispatchSummary } from "./types.ts";

export type OfflineAuthorizationResult =
  | { status: "authorized"; dispatches: SafeDispatchSummary[] }
  | { status: "rejected"; reason: "unknown_operator" | "no_incidents" };

type OfflineAuthorizationDependencies = {
  findOperator: typeof findOperatorById;
  markAuthorized: typeof markIncidentsAuthorized;
  appendAudit: typeof appendOfflineIncidentAuditEvent;
  dispatch: typeof runOfflineNotificationDispatch;
  now: () => Date;
};

const defaultDependencies: OfflineAuthorizationDependencies = {
  findOperator: findOperatorById,
  markAuthorized: markIncidentsAuthorized,
  appendAudit: appendOfflineIncidentAuditEvent,
  dispatch: runOfflineNotificationDispatch,
  now: () => new Date(),
};

export async function authorizeOfflineIncidents(
  input: { operatorId: string; incidentIds: string[] },
  dependencies: OfflineAuthorizationDependencies = defaultDependencies,
): Promise<OfflineAuthorizationResult> {
  const operator = await dependencies.findOperator(input.operatorId);

  if (!operator) {
    return { status: "rejected", reason: "unknown_operator" };
  }

  const incidentIds = [...new Set(input.incidentIds)];

  if (incidentIds.length === 0) {
    return { status: "rejected", reason: "no_incidents" };
  }

  const authorizedAt = dependencies.now().toISOString();
  const authorized = await dependencies.markAuthorized({
    incidentIds,
    actor: operator,
    authorizedAt,
  });

  for (const incident of authorized) {
    await dependencies.appendAudit({
      incidentId: incident.id,
      action: "authorization",
      actor: operator,
      after: authorizedAt,
    });
  }

  const companyNames = [
    ...new Set(authorized.map((incident) => incident.companyName)),
  ];
  const dispatches: SafeDispatchSummary[] = [];

  // Sequential on purpose. Each dispatch reserves notifications through the
  // idempotency engine, and running companies in parallel would race it.
  for (const companyName of companyNames) {
    const result = await dependencies.dispatch({
      send: true,
      scope: { companyName },
    });

    dispatches.push({
      companyName,
      notificationCount: result.notificationCount,
      acceptedCount: result.acceptedCount,
      failedCount: result.failedCount,
      skippedDuplicateCount: result.skippedDuplicateCount,
    });
  }

  return { status: "authorized", dispatches };
}
