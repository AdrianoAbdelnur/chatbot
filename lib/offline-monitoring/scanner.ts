import {
  getCybermapaVehicleReports,
  getCybermapaVehicles,
} from "../cybermapa/services.ts";
import type {
  CybermapaVehicle,
  CybermapaVehicleReport,
} from "../cybermapa/types.ts";
import { normalizeVehiclePlate } from "../cybermapa/normalizers.ts";

import { listEnabledCompanyContacts } from "./company-contact-store.ts";
import { getOfflineThresholdHours } from "./config.ts";
import { reconcileOfflineIncidents } from "./incident-store.ts";
import {
  calculateOfflineHours,
  normalizeMonitoringCompanyName,
  parseCybermapaReportedAt,
} from "./normalizers.ts";
import type {
  CompanyContact,
  IncidentReconciliationResult,
  VehicleMonitoringObservation,
} from "./types.ts";

const CYBERMAPA_REPORT_BATCH_SIZE = 100;

type CybermapaOfflineCheckDependencies = {
  listContacts(): Promise<CompanyContact[]>;
  getVehicles(): Promise<CybermapaVehicle[]>;
  getReports(plates: string[]): Promise<CybermapaVehicleReport[]>;
  reconcile(input: {
    observations: VehicleMonitoringObservation[];
    thresholdHours: number;
    checkedAt: string;
  }): Promise<IncidentReconciliationResult>;
};

const defaultDependencies: CybermapaOfflineCheckDependencies = {
  listContacts: () => listEnabledCompanyContacts("CYBERMAPA"),
  getVehicles: getCybermapaVehicles,
  getReports: getCybermapaVehicleReports,
  reconcile: reconcileOfflineIncidents,
};

async function getReportsInBatches(
  plates: string[],
  getReports: CybermapaOfflineCheckDependencies["getReports"],
) {
  const reports: CybermapaVehicleReport[] = [];

  for (
    let startIndex = 0;
    startIndex < plates.length;
    startIndex += CYBERMAPA_REPORT_BATCH_SIZE
  ) {
    reports.push(
      ...(await getReports(
        plates.slice(startIndex, startIndex + CYBERMAPA_REPORT_BATCH_SIZE),
      )),
    );
  }

  return reports;
}

function selectEligibleVehicles(
  vehicles: CybermapaVehicle[],
  contacts: CompanyContact[],
) {
  const contactsByCompany = new Map(
    contacts
      .filter((contact) => contact.vehicleSource === "platform")
      .map((contact) => [contact.companyKey, contact]),
  );
  const eligibleByPlate = new Map<
    string,
    { companyName: string; plate: string }
  >();
  const ambiguousPlates = new Set<string>();
  let skippedWithoutContact = 0;

  function addEligibleVehicle(companyName: string, plateValue: string) {
    const plate = normalizeVehiclePlate(plateValue);

    if (!plate || ambiguousPlates.has(plate)) {
      return;
    }

    const existingVehicle = eligibleByPlate.get(plate);

    if (
      existingVehicle &&
      normalizeMonitoringCompanyName(existingVehicle.companyName) !==
        normalizeMonitoringCompanyName(companyName)
    ) {
      eligibleByPlate.delete(plate);
      ambiguousPlates.add(plate);
      return;
    }

    eligibleByPlate.set(plate, { companyName, plate });
  }

  for (const contact of contacts) {
    if (contact.vehicleSource !== "manual") {
      continue;
    }

    for (const plate of contact.vehiclePlates) {
      addEligibleVehicle(contact.companyName, plate);
    }
  }

  for (const vehicle of vehicles) {
    const companyKey = normalizeMonitoringCompanyName(vehicle.companyName);
    const contact = contactsByCompany.get(companyKey);

    if (!contact) {
      skippedWithoutContact += 1;
      continue;
    }

    addEligibleVehicle(contact.companyName, vehicle.plate);
  }

  return {
    eligibleVehicles: [...eligibleByPlate.values()],
    skippedWithoutContact,
    ambiguousPlateCount: ambiguousPlates.size,
  };
}

function indexLatestValidReports(
  reports: CybermapaVehicleReport[],
  now: Date,
) {
  const reportByPlate = new Map<string, Date>();
  let invalidReportCount = 0;

  for (const report of reports) {
    const plate = normalizeVehiclePlate(report.plate);
    const reportedAt = parseCybermapaReportedAt(report.reportedAt);

    if (!plate || !reportedAt || reportedAt.getTime() > now.getTime()) {
      invalidReportCount += 1;
      continue;
    }

    const existingReport = reportByPlate.get(plate);

    if (!existingReport || reportedAt > existingReport) {
      reportByPlate.set(plate, reportedAt);
    }
  }

  return { reportByPlate, invalidReportCount };
}

export async function runCybermapaOfflineCheck(
  options: {
    persist?: boolean;
    now?: Date;
    thresholdHours?: number;
  } = {},
  dependencies: CybermapaOfflineCheckDependencies = defaultDependencies,
) {
  const now = options.now ?? new Date();
  const thresholdHours =
    options.thresholdHours ?? getOfflineThresholdHours();
  const contacts = await dependencies.listContacts();

  if (contacts.length === 0) {
    return {
      persist: Boolean(options.persist),
      checkedAt: now.toISOString(),
      thresholdHours,
      contactCount: 0,
      vehicleCount: 0,
      eligibleVehicleCount: 0,
      delayedVehicleCount: 0,
      reportingVehicleCount: 0,
      missingReportCount: 0,
      invalidReportCount: 0,
      skippedWithoutContact: 0,
      ambiguousPlateCount: 0,
      delayedVehicles: [] as VehicleMonitoringObservation[],
      reconciliation: null as IncidentReconciliationResult | null,
    };
  }

  const platformDiscoveryRequired = contacts.some(
    (contact) => contact.vehicleSource === "platform",
  );
  const vehicles = platformDiscoveryRequired
    ? await dependencies.getVehicles()
    : [];
  const selection = selectEligibleVehicles(vehicles, contacts);
  const reports = await getReportsInBatches(
    selection.eligibleVehicles.map((vehicle) => vehicle.plate),
    dependencies.getReports,
  );
  const indexedReports = indexLatestValidReports(reports, now);
  const observations: VehicleMonitoringObservation[] = [];
  let missingReportCount = 0;

  for (const vehicle of selection.eligibleVehicles) {
    const reportedAt = indexedReports.reportByPlate.get(vehicle.plate);

    if (!reportedAt) {
      missingReportCount += 1;
      continue;
    }

    const offlineHours = calculateOfflineHours(now, reportedAt);

    observations.push({
      system: "CYBERMAPA",
      companyName: vehicle.companyName,
      plate: vehicle.plate,
      lastReportedAt: reportedAt.toISOString(),
      offlineHours,
      isOffline: offlineHours > thresholdHours,
    });
  }

  const delayedVehicles = observations.filter(
    (observation) => observation.isOffline,
  );
  const reconciliation = options.persist
    ? await dependencies.reconcile({
        observations,
        thresholdHours,
        checkedAt: now.toISOString(),
      })
    : null;

  return {
    persist: Boolean(options.persist),
    checkedAt: now.toISOString(),
    thresholdHours,
    contactCount: contacts.length,
    vehicleCount: vehicles.length,
    eligibleVehicleCount: selection.eligibleVehicles.length,
    delayedVehicleCount: delayedVehicles.length,
    reportingVehicleCount: observations.length - delayedVehicles.length,
    missingReportCount,
    invalidReportCount: indexedReports.invalidReportCount,
    skippedWithoutContact: selection.skippedWithoutContact,
    ambiguousPlateCount: selection.ambiguousPlateCount,
    delayedVehicles,
    reconciliation,
  };
}
