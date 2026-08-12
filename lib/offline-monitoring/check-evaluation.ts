import { normalizeVehiclePlate } from "../cybermapa/normalizers.ts";
import type { CybermapaVehicleReport } from "../cybermapa/types.ts";
import { calculateOfflineHours, parseCybermapaReportedAt } from "./normalizers.ts";
import type { OfflineCheckOutcome, OfflineCheckVehicleTarget } from "./types.ts";

export function evaluateOfflineCheckBatch(input: {
  targets: OfflineCheckVehicleTarget[];
  reports: CybermapaVehicleReport[];
  now: Date;
  thresholdHours: number;
  error?: string;
}): OfflineCheckOutcome[] {
  const targets = new Map(input.targets.map((target) => [target.vehicleId, target]));
  if (input.error) return [...targets.values()].map(({ vehicleId }) => ({ vehicleId, outcome: "failure", error: input.error }));

  const validReports = new Map<string, Date>();
  const invalidPlates = new Set<string>();
  for (const report of input.reports) {
    const plate = normalizeVehiclePlate(report.plate);
    if (!plate) continue;
    const reportedAt = parseCybermapaReportedAt(report.reportedAt);
    if (!reportedAt || reportedAt > input.now) {
      invalidPlates.add(plate);
      continue;
    }
    const current = validReports.get(plate);
    if (!current || reportedAt > current) validReports.set(plate, reportedAt);
  }

  return [...targets.values()].map((target) => {
    const plate = normalizeVehiclePlate(target.plate ?? "");
    const reportedAt = validReports.get(plate);
    if (!reportedAt) return { vehicleId: target.vehicleId, outcome: invalidPlates.has(plate) ? "invalid" : "missing" };
    const offlineHours = calculateOfflineHours(input.now, reportedAt);
    return {
      vehicleId: target.vehicleId,
      outcome: offlineHours > input.thresholdHours ? "delayed" : "reporting",
      observation: {
        system: "CYBERMAPA" as const,
        companyName: target.companyName ?? target.companyKey,
        plate,
        lastReportedAt: reportedAt.toISOString(),
        offlineHours,
        isOffline: offlineHours > input.thresholdHours,
      },
    };
  });
}
