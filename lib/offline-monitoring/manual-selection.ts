import type { OfflineMonitoringRegistryVehicle } from "./types.ts";

export type ManualSelectionInput = {
  companyKeys: string[];
  vehicles: Array<{ vehicleId: string; companyKey: string }>;
};

export function expandManualSelection(input: ManualSelectionInput, catalog: OfflineMonitoringRegistryVehicle[]) {
  const current = catalog.filter((vehicle) => vehicle.present && vehicle.identityStatus === "ok");
  const byId = new Map(current.map((vehicle) => [vehicle.vehicleId, vehicle]));
  const byCompany = new Map<string, OfflineMonitoringRegistryVehicle[]>();
  for (const vehicle of current) byCompany.set(vehicle.companyKey, [...(byCompany.get(vehicle.companyKey) ?? []), vehicle]);
  const selected = new Map<string, OfflineMonitoringRegistryVehicle>();
  for (const companyKey of input.companyKeys) {
    const vehicles = byCompany.get(companyKey);
    if (!vehicles) throw new Error(`invalid manual target: ${companyKey}`);
    for (const vehicle of vehicles) selected.set(vehicle.vehicleId, vehicle);
  }
  for (const target of input.vehicles) {
    const vehicle = byId.get(target.vehicleId);
    if (!vehicle || vehicle.companyKey !== target.companyKey) throw new Error(`invalid manual target: ${target.vehicleId}`);
    selected.set(vehicle.vehicleId, vehicle);
  }
  if (selected.size === 0) throw new Error("selection must not be empty");
  return [...selected.values()].sort((left, right) => left.vehicleId.localeCompare(right.vehicleId));
}
