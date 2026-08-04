import { authorizationAllowsVehicle } from "../cybermapa/access-store.ts";
import type { CybermapaAuthorization } from "../cybermapa/access-store.ts";
import { validateVehiclePlate } from "../cybermapa/normalizers.ts";
import type { CybermapaVehicleReport } from "../cybermapa/types.ts";
import { parseCybermapaReportedAt } from "../offline-monitoring/normalizers.ts";

import type {
  VehicleServiceFeatures,
  VehicleServiceRecord,
} from "./types.ts";

const MILLISECONDS_PER_MINUTE = 60 * 1_000;

export type CertificateIneligibilityReason =
  | "invalid_plate"
  | "vehicle_not_authorized"
  | "no_recent_report"
  | "no_service_data";

export type EligibleCertificateVehicle = {
  plate: string;
  companyName: string;
  features: VehicleServiceFeatures;
  reportedAt: string;
};

export type IneligibleCertificateVehicle = {
  plate: string;
  reason: CertificateIneligibilityReason;
};

export type CertificateEligibilityResult = {
  status: "all_eligible" | "partially_eligible" | "none_eligible";
  eligible: EligibleCertificateVehicle[];
  ineligible: IneligibleCertificateVehicle[];
};

function indexLatestReports(
  reports: CybermapaVehicleReport[],
  now: Date,
) {
  const reportByPlate = new Map<string, Date>();

  for (const report of reports) {
    const plate = validateVehiclePlate(report.plate);
    const reportedAt = parseCybermapaReportedAt(report.reportedAt);

    // A timestamp in the future cannot back a statement about the present.
    if (!plate || !reportedAt || reportedAt.getTime() > now.getTime()) {
      continue;
    }

    const existingReport = reportByPlate.get(plate);

    if (!existingReport || reportedAt > existingReport) {
      reportByPlate.set(plate, reportedAt);
    }
  }

  return reportByPlate;
}

/**
 * Decides, plate by plate, whether a coverage certificate can be issued.
 * Pure on purpose: every input is already resolved by the caller, so the
 * rules can be tested without Mongo, Cybermapa, or the clock.
 */
export function evaluateCertificateEligibility(input: {
  requestedPlates: unknown[];
  authorization: CybermapaAuthorization;
  reports: CybermapaVehicleReport[];
  serviceRecords: Map<string, VehicleServiceRecord>;
  now: Date;
  windowMinutes: number;
}): CertificateEligibilityResult {
  const reportByPlate = indexLatestReports(input.reports, input.now);
  const oldestAcceptableTime =
    input.now.getTime() - input.windowMinutes * MILLISECONDS_PER_MINUTE;
  const eligible: EligibleCertificateVehicle[] = [];
  const ineligible: IneligibleCertificateVehicle[] = [];
  const seenPlates = new Set<string>();

  for (const requestedPlate of input.requestedPlates) {
    const plate = validateVehiclePlate(requestedPlate);

    if (!plate) {
      ineligible.push({
        plate:
          typeof requestedPlate === "string"
            ? requestedPlate.trim()
            : "",
        reason: "invalid_plate",
      });
      continue;
    }

    if (seenPlates.has(plate)) {
      continue;
    }

    seenPlates.add(plate);

    if (!authorizationAllowsVehicle(input.authorization, plate)) {
      ineligible.push({ plate, reason: "vehicle_not_authorized" });
      continue;
    }

    // Checked before reporting: a vehicle we have no record of cannot be
    // certified at all, so asking the customer to switch it on would be wrong.
    const serviceRecord = input.serviceRecords.get(plate);

    if (!serviceRecord) {
      ineligible.push({ plate, reason: "no_service_data" });
      continue;
    }

    const reportedAt = reportByPlate.get(plate);

    if (!reportedAt || reportedAt.getTime() < oldestAcceptableTime) {
      ineligible.push({ plate, reason: "no_recent_report" });
      continue;
    }

    eligible.push({
      plate,
      companyName: serviceRecord.companyName,
      features: serviceRecord.features,
      reportedAt: reportedAt.toISOString(),
    });
  }

  if (eligible.length === 0) {
    return { status: "none_eligible", eligible, ineligible };
  }

  if (ineligible.length === 0) {
    return { status: "all_eligible", eligible, ineligible };
  }

  return { status: "partially_eligible", eligible, ineligible };
}
