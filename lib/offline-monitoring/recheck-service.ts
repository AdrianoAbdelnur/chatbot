import { normalizeVehiclePlate } from "../cybermapa/normalizers.ts";
import { getCybermapaVehicleReports } from "../cybermapa/services.ts";

import { getOfflineThresholdHours } from "./config.ts";
import { appendOfflineIncidentAuditEvent } from "./incident-audit-store.ts";
import { reconcileOfflineIncidents } from "./incident-store.ts";
import { findActiveIncidentById } from "./incident-review-store.ts";
import {
  calculateOfflineHours,
  parseCybermapaReportedAt,
} from "./normalizers.ts";
import { findOperatorById } from "./operator-directory-store.ts";

export type OfflineRecheckResult =
  | { status: "applied" }
  | { status: "no_change" }
  | { status: "rejected"; reason: "unknown_operator" | "unknown_incident" }
  | { status: "upstream_failure"; reason: string };

type OfflineRecheckDependencies = {
  findOperator: typeof findOperatorById;
  findIncident: typeof findActiveIncidentById;
  getReports: typeof getCybermapaVehicleReports;
  reconcile: typeof reconcileOfflineIncidents;
  appendAudit: typeof appendOfflineIncidentAuditEvent;
  now: () => Date;
  thresholdHours: () => number;
};

const defaultDependencies: OfflineRecheckDependencies = {
  findOperator: findOperatorById,
  findIncident: findActiveIncidentById,
  getReports: getCybermapaVehicleReports,
  reconcile: reconcileOfflineIncidents,
  appendAudit: appendOfflineIncidentAuditEvent,
  now: () => new Date(),
  thresholdHours: getOfflineThresholdHours,
};

export async function recheckOfflineVehicle(
  input: { operatorId: string; incidentId: string },
  dependencies: OfflineRecheckDependencies = defaultDependencies,
): Promise<OfflineRecheckResult> {
  const operator = await dependencies.findOperator(input.operatorId);

  if (!operator) {
    return { status: "rejected", reason: "unknown_operator" };
  }

  const incident = await dependencies.findIncident(input.incidentId);

  if (!incident) {
    return { status: "rejected", reason: "unknown_incident" };
  }

  const now = dependencies.now();
  let reports;

  try {
    reports = await dependencies.getReports([incident.plate]);
  } catch (error) {
    // The incident is left byte-identical: an upstream outage must never
    // overwrite lastReportedAt with a guess.
    await dependencies.appendAudit({
      incidentId: incident.id,
      action: "recheck",
      actor: operator,
      outcome: "upstream_failure",
    });

    return {
      status: "upstream_failure",
      reason:
        error instanceof Error
          ? error.message
          : "The vehicle report request failed.",
    };
  }

  const reportedAt = selectLatestValidReport(reports, incident.plate, now);

  if (!reportedAt) {
    await dependencies.appendAudit({
      incidentId: incident.id,
      action: "recheck",
      actor: operator,
      outcome: "no_change",
    });

    return { status: "no_change" };
  }

  const offlineHours = calculateOfflineHours(now, reportedAt);

  await dependencies.reconcile({
    observations: [
      {
        system: "CYBERMAPA",
        // The upstream report carries only plate and timestamp, so the company
        // always comes from the stored incident.
        companyName: incident.companyName,
        plate: incident.plate,
        lastReportedAt: reportedAt.toISOString(),
        offlineHours,
        isOffline: offlineHours > dependencies.thresholdHours(),
      },
    ],
    thresholdHours: dependencies.thresholdHours(),
    checkedAt: now.toISOString(),
  });

  await dependencies.appendAudit({
    incidentId: incident.id,
    action: "recheck",
    actor: operator,
    before: incident.lastReportedAt,
    after: reportedAt.toISOString(),
    outcome: "applied",
  });

  return { status: "applied" };
}

function selectLatestValidReport(
  reports: Awaited<ReturnType<typeof getCybermapaVehicleReports>>,
  plate: string,
  now: Date,
) {
  let latest: Date | null = null;

  for (const report of reports) {
    if (normalizeVehiclePlate(report.plate) !== plate) {
      continue;
    }

    const reportedAt = parseCybermapaReportedAt(report.reportedAt);

    if (!reportedAt || reportedAt.getTime() > now.getTime()) {
      continue;
    }

    if (!latest || reportedAt > latest) {
      latest = reportedAt;
    }
  }

  return latest;
}
