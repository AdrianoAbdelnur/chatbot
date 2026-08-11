import { calculateOfflineHours } from "./normalizers.ts";

import type {
  OfflineBoardIncident,
  OfflineBoardNotification,
  OfflineBoardRow,
  WhatsappQueryState,
} from "./types.ts";

function resolveWhatsappQueryState(
  incident: OfflineBoardIncident,
  notification: OfflineBoardNotification | null,
): WhatsappQueryState {
  // The reservation is checked before the authorization stamp on purpose. An
  // incident notified before the authorization gate existed carries a
  // reservation and no authorizedAt; reporting it as "not authorized" would
  // invite an operator to authorize a row that can never dispatch again,
  // because the eligibility filter excludes anything already reserved.
  if (incident.initialNotificationId) {
    // A reservation without a readable notification is still in flight.
    // Reporting anything stronger than "dispatching" would claim a send we
    // cannot prove.
    if (!notification || notification.status === "pending") {
      return "dispatching";
    }

    return notification.status === "accepted" ? "sent" : "failed";
  }

  // A Meta rejection releases the reservation, so a released incident lands
  // here and correctly returns to a dispatchable state.
  if (!incident.authorizedAt) {
    return "not_authorized";
  }

  return "authorized_not_sent";
}

export function toBoardRow(
  incident: OfflineBoardIncident,
  notification: OfflineBoardNotification | null,
  now: Date,
): OfflineBoardRow {
  const whatsappQueryState = resolveWhatsappQueryState(incident, notification);

  return {
    id: incident.id,
    system: incident.system,
    companyName: incident.companyName,
    plate: incident.plate,
    lastReportedAt: incident.lastReportedAt,
    offlineHours: calculateOfflineHours(now, new Date(incident.lastReportedAt)),
    operationalStatus: incident.operationalStatus ?? null,
    operatorComment: incident.operatorComment ?? null,
    reviewedAt: incident.reviewedAt ?? null,
    reviewedBy: incident.reviewedBy ?? null,
    authorizedAt: incident.authorizedAt ?? null,
    whatsappQueryState,
    whatsappFailureReason:
      whatsappQueryState === "failed"
        ? (notification?.failureReason ?? null)
        : null,
    whatsappCustomerReply: notification?.customerReply ?? null,
  };
}
