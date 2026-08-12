import { expandManualSelection, type ManualSelectionInput } from "./manual-selection.ts";
import { runOfflineCheck } from "./check-service.ts";
import type { OfflineMonitoringRegistryVehicle } from "./types.ts";

type Dependencies = {
  catalog: { synchronize(): Promise<{ companies: Array<{ vehicles: OfflineMonitoringRegistryVehicle[] }> }> };
  registry: { listCurrent(): Promise<OfflineMonitoringRegistryVehicle[]> };
  history: Parameters<typeof runOfflineCheck>[1]["history"];
  getReports: Parameters<typeof runOfflineCheck>[1]["getReports"];
  reconcile: Parameters<typeof runOfflineCheck>[1]["reconcile"];
  findOperator: (id: string) => Promise<unknown>;
};

export function createManualCheckDependencies(dependencies: Dependencies) {
  return dependencies;
}

export async function runManualCheck(input: ManualSelectionInput & { operatorId: string; idempotencyKey: string }, dependencies: Dependencies) {
  if (!(await dependencies.findOperator(input.operatorId))) throw new Error("unknown operator");
  await dependencies.catalog.synchronize();
  const catalog = await dependencies.registry.listCurrent();
  const targets = expandManualSelection(input, catalog);
  return runOfflineCheck({ executionId: `manual:${input.idempotencyKey}`, source: "manual", targets, now: new Date(), thresholdHours: 48 }, dependencies);
}
