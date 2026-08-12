import { normalizeVehiclePlate } from "../cybermapa/normalizers.ts";

import { createRegistryVehicleId } from "./registry-identity.ts";
import type { OfflineMonitoringCatalogVehicle } from "./types.ts";

export const LEGACY_87_MIGRATION_ID = "legacy-87-v1";
export const LEGACY_87_VEHICLE_COUNT = 87;

export type LegacyMigrationResult =
  | { status: "ready"; count: number }
  | { status: "initialized" | "already_initialized"; count: number }
  | { status: "invalid"; reason: "legacy_plate_count" | "unresolved_catalog_identity" | "duplicate_catalog_identity" };

type Dependencies = {
  listLegacyPlates: () => Promise<string[]>;
  resolveCatalog: () => Promise<OfflineMonitoringCatalogVehicle[]>;
  hasMarker: () => Promise<boolean>;
  createMarker: () => Promise<boolean>;
  initializeMembership: (vehicle: OfflineMonitoringCatalogVehicle) => Promise<void>;
};

function normalizedDistinct(plates: string[]) {
  return [...new Set(plates.map(normalizeVehiclePlate).filter(Boolean))];
}

function validateCatalog(legacyPlates: string[], catalog: OfflineMonitoringCatalogVehicle[]) {
  const byId = new Map<string, OfflineMonitoringCatalogVehicle>();
  const duplicates = new Set<string>();
  for (const vehicle of catalog) {
    const id = createRegistryVehicleId(vehicle.plate);
    if (byId.has(id)) duplicates.add(id);
    byId.set(id, vehicle);
  }
  const legacyIds = legacyPlates.map(createRegistryVehicleId);
  if (legacyIds.some((id) => duplicates.has(id))) return { reason: "duplicate_catalog_identity" as const };
  const resolved = legacyIds.map((id) => byId.get(id));
  if (resolved.some((vehicle) => !vehicle)) return { reason: "unresolved_catalog_identity" as const };
  return { vehicles: resolved as OfflineMonitoringCatalogVehicle[] };
}

export function createLegacy87Migration(dependencies: Dependencies) {
  async function run({ dryRun = false }: { dryRun?: boolean } = {}): Promise<LegacyMigrationResult> {
    const legacyPlates = normalizedDistinct(await dependencies.listLegacyPlates());
    if (legacyPlates.length !== LEGACY_87_VEHICLE_COUNT) return { status: "invalid", reason: "legacy_plate_count" };
    if (await dependencies.hasMarker()) return { status: "already_initialized", count: LEGACY_87_VEHICLE_COUNT };
    const validation = validateCatalog(legacyPlates, await dependencies.resolveCatalog());
    if ("reason" in validation) return { status: "invalid", reason: validation.reason! };
    if (dryRun) return { status: "ready", count: validation.vehicles.length };
    await Promise.all(validation.vehicles.map(dependencies.initializeMembership));
    await dependencies.createMarker();
    return { status: "initialized", count: validation.vehicles.length };
  }

  return { run };
}