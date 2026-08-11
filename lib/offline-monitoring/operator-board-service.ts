import { toBoardRow } from "./board-row.ts";
import { appendOfflineIncidentAuditEvent } from "./incident-audit-store.ts";
import {
  applyOperatorReview,
  findBoardNotificationsByIds,
  listBoardIncidents,
} from "./incident-review-store.ts";
import { findOperatorById } from "./operator-directory-store.ts";
import { isOfflineOperationalStatus } from "./operational-status.ts";
import type { OfflineBoardRow } from "./types.ts";

export const MAX_OPERATOR_COMMENT_LENGTH = 1_000;

export type OperatorReviewResult =
  | { status: "applied" }
  | {
      status: "rejected";
      reason:
        | "unknown_operator"
        | "invalid_status"
        | "comment_too_long"
        | "unknown_incident";
    };

type OperatorBoardReadDependencies = {
  listIncidents: typeof listBoardIncidents;
  findNotifications: typeof findBoardNotificationsByIds;
  now: () => Date;
};

type OperatorReviewDependencies = {
  findOperator: typeof findOperatorById;
  applyReview: typeof applyOperatorReview;
  appendAudit: typeof appendOfflineIncidentAuditEvent;
  now: () => Date;
};

const defaultReadDependencies: OperatorBoardReadDependencies = {
  listIncidents: listBoardIncidents,
  findNotifications: findBoardNotificationsByIds,
  now: () => new Date(),
};

const defaultReviewDependencies: OperatorReviewDependencies = {
  findOperator: findOperatorById,
  applyReview: applyOperatorReview,
  appendAudit: appendOfflineIncidentAuditEvent,
  now: () => new Date(),
};

export async function listOperatorBoard(
  dependencies: OperatorBoardReadDependencies = defaultReadDependencies,
): Promise<OfflineBoardRow[]> {
  const incidents = await dependencies.listIncidents();
  const notificationIds = [
    ...new Set(
      incidents
        .map((incident) => incident.initialNotificationId)
        .filter((notificationId) => typeof notificationId === "string"),
    ),
  ];
  const notifications = await dependencies.findNotifications(notificationIds);
  const now = dependencies.now();

  return incidents.map((incident) =>
    toBoardRow(
      incident,
      incident.initialNotificationId
        ? (notifications.get(incident.initialNotificationId) ?? null)
        : null,
      now,
    ),
  );
}

export async function submitOperatorReview(
  input: {
    operatorId: string;
    incidentId: string;
    operationalStatus: string;
    comment?: string;
  },
  dependencies: OperatorReviewDependencies = defaultReviewDependencies,
): Promise<OperatorReviewResult> {
  const operator = await dependencies.findOperator(input.operatorId);

  if (!operator) {
    return { status: "rejected", reason: "unknown_operator" };
  }

  if (!isOfflineOperationalStatus(input.operationalStatus)) {
    return { status: "rejected", reason: "invalid_status" };
  }

  // The limit is measured after trimming and the request is rejected outright.
  // A comment is the operator's own words and is never silently truncated.
  const comment = input.comment?.trim() ?? "";

  if (comment.length > MAX_OPERATOR_COMMENT_LENGTH) {
    return { status: "rejected", reason: "comment_too_long" };
  }

  const applied = await dependencies.applyReview({
    incidentId: input.incidentId,
    operationalStatus: input.operationalStatus,
    comment: comment || null,
    actor: operator,
    reviewedAt: dependencies.now().toISOString(),
  });

  if (!applied) {
    return { status: "rejected", reason: "unknown_incident" };
  }

  await dependencies.appendAudit({
    incidentId: input.incidentId,
    action: "status_change",
    actor: operator,
    before: applied.previousOperationalStatus,
    after: input.operationalStatus,
  });

  return { status: "applied" };
}
