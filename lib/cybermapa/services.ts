import { getCybermapaClient } from "./client.ts";
import {
  findCybermapaVehicleStatusByIdentifier,
  parseCybermapaVehicles,
  parseCybermapaVehicleReports,
  parseCybermapaVehicleStatuses,
  validateVehicleIdentifier,
  type CybermapaVehicleIdentifierType,
} from "./normalizers.ts";

export async function getCybermapaVehicles() {
  const payload = await getCybermapaClient().request("GETVEHICULOS");
  return parseCybermapaVehicles(payload);
}

export async function getCybermapaVehicleReports(plates: string[]) {
  const normalizedPlates = [
    ...new Set(
      plates
        .map((plate) => validateVehicleIdentifier(plate, "patente"))
        .filter(
          (
            identifier,
          ): identifier is { type: "patente"; value: string } =>
            identifier?.type === "patente",
        )
        .map((identifier) => identifier.value),
    ),
  ];

  if (normalizedPlates.length === 0) {
    return [];
  }

  const payload = await getCybermapaClient().request("DATOSACTUALES", {
    vehiculos: normalizedPlates,
    tipoID: "patente",
  });

  return parseCybermapaVehicleReports(payload);
}

export async function getCurrentCybermapaVehicleStatus(
  identifier: string,
  identifierType: CybermapaVehicleIdentifierType = "patente",
) {
  const validatedIdentifier = validateVehicleIdentifier(
    identifier,
    identifierType,
  );

  if (!validatedIdentifier) {
    return null;
  }

  const payload = await getCybermapaClient().request("DATOSACTUALES", {
    vehiculos: [validatedIdentifier.value],
    tipoID: validatedIdentifier.type,
  });
  const statuses = parseCybermapaVehicleStatuses(payload);

  return findCybermapaVehicleStatusByIdentifier(
    statuses,
    validatedIdentifier.value,
    validatedIdentifier.type,
  );
}
