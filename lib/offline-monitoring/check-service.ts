import { evaluateOfflineCheckBatch } from "./check-evaluation.ts";
import type { OfflineCheckOutcome, OfflineCheckVehicleTarget } from "./types.ts";

type CheckInput = {
  executionId: string;
  source: "cron" | "manual";
  targets: OfflineCheckVehicleTarget[];
  now: Date;
  thresholdHours: number;
};

type CheckDependencies = {
  history: {
    startExecution(input: { executionId: string; source: "cron" | "manual"; requestedVehicles: OfflineCheckVehicleTarget[] }): Promise<unknown>;
    upsertOutcome(executionId: string, outcome: OfflineCheckOutcome & { companyKey: string }): Promise<void>;
    finalizeExecution(executionId: string): Promise<{ status: string; [key: string]: unknown }>;
  };
  getReports(plates: string[]): Promise<{ plate: string; reportedAt: string }[]>;
  reconcile(input: { observations: NonNullable<OfflineCheckOutcome["observation"]>[]; thresholdHours: number; checkedAt: string }): Promise<unknown>;
};

export async function runOfflineCheck(input: CheckInput, dependencies: CheckDependencies) {
  await dependencies.history.startExecution({ executionId: input.executionId, source: input.source, requestedVehicles: input.targets });
  const targets = [...new Map(input.targets.map((target) => [target.vehicleId, target])).values()];
  const outcomes: OfflineCheckOutcome[] = [];
  for (let start = 0; start < targets.length; start += 100) {
    const batch = targets.slice(start, start + 100);
    try {
      const reports = await dependencies.getReports(batch.map((target) => target.plate ?? ""));
      outcomes.push(...evaluateOfflineCheckBatch({ targets: batch, reports, now: input.now, thresholdHours: input.thresholdHours }));
    } catch (error) {
      outcomes.push(...evaluateOfflineCheckBatch({ targets: batch, reports: [], now: input.now, thresholdHours: input.thresholdHours, error: error instanceof Error ? error.message : "The vehicle report request failed." }));
    }
  }
  for (const outcome of outcomes) {
    const target = targets.find(({ vehicleId }) => vehicleId === outcome.vehicleId)!;
    await dependencies.history.upsertOutcome(input.executionId, { ...outcome, companyKey: target.companyKey });
  }
  const observations = outcomes.flatMap((outcome) => outcome.observation ? [outcome.observation] : []);
  if (observations.length > 0) await dependencies.reconcile({ observations, thresholdHours: input.thresholdHours, checkedAt: input.now.toISOString() });
  return await dependencies.history.finalizeExecution(input.executionId);
}
