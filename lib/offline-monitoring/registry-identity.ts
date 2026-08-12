import { normalizeVehiclePlate } from "../cybermapa/normalizers.ts";

import { normalizeMonitoringCompanyName } from "./normalizers.ts";
import type { OfflineMonitoringCatalogVehicle, RegistryIdentityStatus } from "./types.ts";

type ExistingRegistryIdentity = {
  vehicleId: string;
  gpsId: string | null;
  companyKey: string;
};

export function createRegistryVehicleId(plate: string) {
  const normalizedPlate = normalizeVehiclePlate(plate);

  if (!normalizedPlate) {
    throw new Error("A vehicle plate is required for registry identity.");
  }

  return `CYBERMAPA:${normalizedPlate}`;
}

export function evaluateRegistryIdentity(input: {
  incoming: OfflineMonitoringCatalogVehicle;
  existing?: ExistingRegistryIdentity;
  duplicatePlate?: boolean;
}) {
  const plate = normalizeVehiclePlate(input.incoming.plate);
  const vehicleId = createRegistryVehicleId(plate);
  const gpsId = input.incoming.gpsId?.trim() || null;
  const companyKey = normalizeMonitoringCompanyName(input.incoming.companyName);

  if (!companyKey) {
    throw new Error("A company name is required for registry catalog entries.");
  }

  const changedNonEmptyGps = Boolean(
    input.existing?.gpsId && gpsId && input.existing.gpsId !== gpsId,
  );

  const identityStatus: RegistryIdentityStatus = input.duplicatePlate || changedNonEmptyGps ? "identityConflict" : "ok";
  return {
    vehicleId,
    system: input.incoming.system,
    plate,
    gpsId,
    companyName: input.incoming.companyName.trim().replace(/\s+/g, " "),
    companyKey,
    identityStatus,
  };
}

export function resolveCatalogIdentities(inputs: OfflineMonitoringCatalogVehicle[]) {
  const normalizedPlates = inputs.map((input) =>
    normalizeVehiclePlate(input.plate),
  );
  const plateCounts = new Map<string, number>();

  for (const plate of normalizedPlates) {
    plateCounts.set(plate, (plateCounts.get(plate) ?? 0) + 1);
  }

  return inputs.map((incoming, index) =>
    evaluateRegistryIdentity({
      incoming,
      duplicatePlate: (plateCounts.get(normalizedPlates[index]) ?? 0) > 1,
    }),
  );
}
