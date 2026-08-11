import { normalizeVehiclePlate } from "../cybermapa/normalizers.ts";
import {
  getCybermapaVehicleReports,
  getCybermapaVehicles,
} from "../cybermapa/services.ts";

import { listEnabledCompanyContacts } from "./company-contact-store.ts";
import { getOfflineThresholdHours } from "./config.ts";
import { reconcileOfflineIncidents } from "./incident-store.ts";
import {
  calculateOfflineHours,
  normalizeMonitoringCompanyName,
  parseCybermapaReportedAt,
} from "./normalizers.ts";
import { findOperatorById } from "./operator-directory-store.ts";
import type { VehicleMonitoringObservation } from "./types.ts";

const CYBERMAPA_REPORT_BATCH_SIZE = 100;

export type MonitoringCompanySummary = {
  companyKey: string;
  companyName: string;
  vehicleCount: number;
  hasContact: boolean;
};

export type CompanyScanResult =
  | {
      status: "scanned";
      companyName: string;
      vehicleCount: number;
      delayedCount: number;
      reportingCount: number;
      missingReportCount: number;
      created: number;
      updated: number;
      resolved: number;
    }
  | {
      status: "rejected";
      reason: "unknown_operator" | "unknown_company";
    }
  | { status: "upstream_failure"; reason: string };

type CompanyScanDependencies = {
  findOperator: typeof findOperatorById;
  getVehicles: typeof getCybermapaVehicles;
  getReports: typeof getCybermapaVehicleReports;
  listContacts: () => ReturnType<typeof listEnabledCompanyContacts>;
  reconcile: typeof reconcileOfflineIncidents;
  now: () => Date;
  thresholdHours: () => number;
};

const defaultDependencies: CompanyScanDependencies = {
  findOperator: findOperatorById,
  getVehicles: getCybermapaVehicles,
  getReports: getCybermapaVehicleReports,
  listContacts: () => listEnabledCompanyContacts("CYBERMAPA"),
  reconcile: reconcileOfflineIncidents,
  now: () => new Date(),
  thresholdHours: getOfflineThresholdHours,
};

function groupVehiclesByCompany(
  vehicles: Awaited<ReturnType<typeof getCybermapaVehicles>>,
) {
  const companies = new Map<
    string,
    { companyName: string; plates: string[] }
  >();

  for (const vehicle of vehicles) {
    const companyKey = normalizeMonitoringCompanyName(vehicle.companyName);
    const plate = normalizeVehiclePlate(vehicle.plate);

    if (!companyKey || !plate) {
      continue;
    }

    const company = companies.get(companyKey);

    if (company) {
      if (!company.plates.includes(plate)) {
        company.plates.push(plate);
      }

      continue;
    }

    companies.set(companyKey, {
      companyName: normalizeMonitoringCompanyName(vehicle.companyName),
      plates: [plate],
    });
  }

  return companies;
}

export async function listMonitoringCompanies(
  dependencies: CompanyScanDependencies = defaultDependencies,
): Promise<MonitoringCompanySummary[]> {
  const [vehicles, contacts] = await Promise.all([
    dependencies.getVehicles(),
    dependencies.listContacts(),
  ]);
  const contactKeys = new Set(contacts.map((contact) => contact.companyKey));

  return [...groupVehiclesByCompany(vehicles).entries()]
    .map(([companyKey, company]) => ({
      companyKey,
      companyName: company.companyName,
      vehicleCount: company.plates.length,
      hasContact: contactKeys.has(companyKey),
    }))
    .sort((left, right) =>
      left.companyName.localeCompare(right.companyName, "es"),
    );
}

export async function scanCompanyVehicles(
  input: { operatorId: string; companyKey: string },
  dependencies: CompanyScanDependencies = defaultDependencies,
): Promise<CompanyScanResult> {
  const operator = await dependencies.findOperator(input.operatorId);

  if (!operator) {
    return { status: "rejected", reason: "unknown_operator" };
  }

  const [vehicles, contacts] = await Promise.all([
    dependencies.getVehicles(),
    dependencies.listContacts(),
  ]);
  const companyKey = normalizeMonitoringCompanyName(input.companyKey);
  const company = groupVehiclesByCompany(vehicles).get(companyKey);

  if (!company) {
    return { status: "rejected", reason: "unknown_company" };
  }

  // A registered company keeps the contact's display name so every incident of
  // that company shares one spelling. Only a company with no contact — which
  // cannot be notified anyway — carries the raw platform name.
  const contact = contacts.find(
    (companyContact) => companyContact.companyKey === companyKey,
  );
  const companyName = contact ? contact.companyName : company.companyName;
  const now = dependencies.now();
  const thresholdHours = dependencies.thresholdHours();
  const reports = [];

  try {
    for (
      let startIndex = 0;
      startIndex < company.plates.length;
      startIndex += CYBERMAPA_REPORT_BATCH_SIZE
    ) {
      reports.push(
        ...(await dependencies.getReports(
          company.plates.slice(
            startIndex,
            startIndex + CYBERMAPA_REPORT_BATCH_SIZE,
          ),
        )),
      );
    }
  } catch (error) {
    return {
      status: "upstream_failure",
      reason:
        error instanceof Error
          ? error.message
          : "The vehicle report request failed.",
    };
  }

  const reportByPlate = new Map<string, Date>();

  for (const report of reports) {
    const plate = normalizeVehiclePlate(report.plate);
    const reportedAt = parseCybermapaReportedAt(report.reportedAt);

    if (!plate || !reportedAt || reportedAt.getTime() > now.getTime()) {
      continue;
    }

    const existing = reportByPlate.get(plate);

    if (!existing || reportedAt > existing) {
      reportByPlate.set(plate, reportedAt);
    }
  }

  const observations: VehicleMonitoringObservation[] = [];
  let missingReportCount = 0;

  for (const plate of company.plates) {
    const reportedAt = reportByPlate.get(plate);

    if (!reportedAt) {
      missingReportCount += 1;
      continue;
    }

    const offlineHours = calculateOfflineHours(now, reportedAt);

    observations.push({
      system: "CYBERMAPA",
      companyName,
      plate,
      lastReportedAt: reportedAt.toISOString(),
      offlineHours,
      isOffline: offlineHours > thresholdHours,
    });
  }

  const reconciliation = await dependencies.reconcile({
    observations,
    thresholdHours,
    checkedAt: now.toISOString(),
  });
  const delayedCount = observations.filter(
    (observation) => observation.isOffline,
  ).length;

  return {
    status: "scanned",
    companyName,
    vehicleCount: company.plates.length,
    delayedCount,
    reportingCount: observations.length - delayedCount,
    missingReportCount,
    created: reconciliation.created,
    updated: reconciliation.updated,
    resolved: reconciliation.resolved,
  };
}
