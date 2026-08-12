import { resolveCatalogIdentities } from "./registry-identity.ts";
import type {
  OfflineMonitoringCatalogVehicle,
  OfflineMonitoringRegistryVehicle,
} from "./types.ts";

type CatalogStore = {
  lookup(vehicleId: string): Promise<OfflineMonitoringRegistryVehicle | null>;
  upsertCatalogVehicle(
    input: OfflineMonitoringCatalogVehicle,
    identity?: Omit<OfflineMonitoringRegistryVehicle, "enabled" | "present" | "firstSeenAt" | "lastSeenAt">,
  ): Promise<OfflineMonitoringRegistryVehicle>;
  markUnseen(vehicleIds: string[]): Promise<void>;
  listCurrent(): Promise<OfflineMonitoringRegistryVehicle[]>;
};

type Dependencies = {
  fetchVehicles: () => Promise<OfflineMonitoringCatalogVehicle[]>;
  store: CatalogStore;
};

export function createCatalogService({ fetchVehicles, store }: Dependencies) {
  async function synchronize(inputVehicles?: OfflineMonitoringCatalogVehicle[]) {
    const vehicles = inputVehicles ?? await fetchVehicles();
    const identities = resolveCatalogIdentities(vehicles);
    const seenIds: string[] = [];

    for (let index = 0; index < vehicles.length; index += 1) {
      const identity = identities[index]!;
      const existing = await store.lookup(identity.vehicleId);
      const resolved = existing
        ? {
            ...identity,
            identityStatus:
              existing.gpsId && identity.gpsId && existing.gpsId !== identity.gpsId
                ? "identityConflict" as const
                : identity.identityStatus,
          }
        : identity;
      seenIds.push(resolved.vehicleId);
      await store.upsertCatalogVehicle(vehicles[index]!, resolved);
    }
    await store.markUnseen(seenIds);
    const current = await store.listCurrent();
    const companies = new Map<string, { companyKey: string; companyName: string; vehicles: OfflineMonitoringRegistryVehicle[] }>();
    for (const vehicle of current) {
      const company = companies.get(vehicle.companyKey) ?? { companyKey: vehicle.companyKey, companyName: vehicle.companyName, vehicles: [] };
      company.vehicles.push(vehicle);
      companies.set(vehicle.companyKey, company);
    }
    return { companies: [...companies.values()].sort((a, b) => a.companyName.localeCompare(b.companyName)) };
  }

  return { synchronize };
}
