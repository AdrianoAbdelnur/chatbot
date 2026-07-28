import { CybermapaError } from "./errors.ts";
import type {
  CybermapaVehicle,
  CybermapaVehicleReport,
  CybermapaVehicleStatus,
} from "./types.ts";

type UnknownRecord = Record<string, unknown>;

export type CybermapaVehicleIdentifierType =
  | "patente"
  | "alias"
  | "gps";

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(
  record: UnknownRecord,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function readNumber(
  record: UnknownRecord,
  ...keys: string[]
): number | null {
  const value = readString(record, ...keys);

  if (value === null || value === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function requireString(
  record: UnknownRecord,
  ...keys: string[]
): string {
  const value = readString(record, ...keys);

  if (!value) {
    throw new CybermapaError(
      "invalid_response",
      `Cybermapa omitted the required field ${keys[0]}.`,
    );
  }

  return value;
}

export function decodeCybermapaText(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function normalizeTextIdentifier(value: string) {
  return decodeCybermapaText(value)
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function normalizeVehiclePlate(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function validateVehiclePlate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedPlate = normalizeVehiclePlate(value);

  if (
    normalizedPlate.length < 5 ||
    normalizedPlate.length > 10
  ) {
    return null;
  }

  return normalizedPlate;
}

export function validateVehicleIdentifier(
  value: unknown,
  type: unknown,
): {
  type: CybermapaVehicleIdentifierType;
  value: string;
} | null {
  if (
    type !== "patente" &&
    type !== "alias" &&
    type !== "gps"
  ) {
    return null;
  }

  if (type === "patente") {
    const plate = validateVehiclePlate(value);
    return plate ? { type, value: plate } : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().replace(/\s+/g, " ");

  if (
    normalizedValue.length < 3 ||
    normalizedValue.length > 100
  ) {
    return null;
  }

  if (type === "gps" && !/^\d{5,30}$/.test(normalizedValue)) {
    return null;
  }

  return {
    type,
    value: normalizedValue,
  };
}

export function parseCybermapaVehicles(
  payload: unknown,
): CybermapaVehicle[] {
  if (!Array.isArray(payload)) {
    throw new CybermapaError(
      "invalid_response",
      "Cybermapa returned an invalid vehicle list.",
    );
  }

  return payload.map((item) => {
    if (!isRecord(item)) {
      throw new CybermapaError(
        "invalid_response",
        "Cybermapa returned an invalid vehicle.",
      );
    }

    const plate = requireString(item, "patente", "PATENTE");

    return {
      companyName:
        readString(item, "nombre_empresa", "NOMBRE_EMPRESA") ?? "",
      make: readString(item, "marca", "MARCA") ?? "",
      model: readString(item, "modelo", "MODELO") ?? "",
      color: readString(item, "color", "COLOR") ?? "",
      year: readString(item, "anio", "ANIO") ?? "",
      plate,
      description:
        readString(item, "descripcion", "DESCRIPCION") ?? "",
      gpsId: readString(item, "id_gps", "gps", "GPS") ?? "",
      moduleName:
        readString(item, "nombre_modulo", "NOMBRE_MODULO") ?? "",
      alias: readString(item, "alias", "ALIAS") ?? "",
      name: readString(item, "nombre", "NOMBRE") ?? "",
    };
  });
}

export function parseCybermapaVehicleStatuses(
  payload: unknown,
): CybermapaVehicleStatus[] {
  if (!Array.isArray(payload)) {
    throw new CybermapaError(
      "invalid_response",
      "Cybermapa returned invalid current-position data.",
    );
  }

  return payload.map((item) => {
    if (!isRecord(item)) {
      throw new CybermapaError(
        "invalid_response",
        "Cybermapa returned an invalid current-position record.",
      );
    }

    const latitude = readNumber(item, "latitud", "LATITUD");
    const longitude = readNumber(item, "longitud", "LONGITUD");

    if (
      latitude === null ||
      latitude < -90 ||
      latitude > 90 ||
      longitude === null ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new CybermapaError(
        "invalid_response",
        "Cybermapa returned invalid coordinates.",
      );
    }

    return {
      name: decodeCybermapaText(
        readString(item, "nombre", "NOMBRE") ?? "",
      ),
      alias: decodeCybermapaText(
        readString(item, "alias", "ALIAS") ?? "",
      ),
      plate: requireString(item, "patente", "PATENTE"),
      gpsId: readString(item, "gps", "GPS") ?? "",
      latitude,
      longitude,
      reportedAt: requireString(
        item,
        "fecha",
        "FECHA",
        "fecha_posicion",
        "FECHA_POSICION",
      ),
      directionDegrees: readNumber(item, "sentido", "SENTIDO"),
      speedKph: readNumber(item, "velocidad", "VELOCIDAD"),
      eventCode: readString(item, "evento", "EVENTO") ?? "",
    };
  });
}

export function parseCybermapaVehicleReports(
  payload: unknown,
): CybermapaVehicleReport[] {
  if (!Array.isArray(payload)) {
    throw new CybermapaError(
      "invalid_response",
      "Cybermapa returned invalid vehicle report data.",
    );
  }

  return payload.map((item) => {
    if (!isRecord(item)) {
      throw new CybermapaError(
        "invalid_response",
        "Cybermapa returned an invalid vehicle report.",
      );
    }

    return {
      plate: requireString(item, "patente", "PATENTE"),
      reportedAt: decodeCybermapaText(
        requireString(
          item,
          "fecha",
          "FECHA",
          "fecha_posicion",
          "FECHA_POSICION",
        ),
      ),
    };
  });
}

export function findCybermapaVehicleStatusByPlate(
  statuses: CybermapaVehicleStatus[],
  requestedPlate: string,
) {
  const normalizedRequestedPlate =
    normalizeVehiclePlate(requestedPlate);

  return (
    statuses.find(
      (status) =>
        normalizeVehiclePlate(status.plate) ===
        normalizedRequestedPlate,
    ) ?? null
  );
}

export function findCybermapaVehicleStatusByIdentifier(
  statuses: CybermapaVehicleStatus[],
  identifier: string,
  type: CybermapaVehicleIdentifierType,
) {
  if (type === "patente") {
    return findCybermapaVehicleStatusByPlate(
      statuses,
      identifier,
    );
  }

  const normalizedIdentifier = normalizeTextIdentifier(identifier);

  return (
    statuses.find((status) => {
      const candidate =
        type === "alias" ? status.alias : status.gpsId;

      return (
        normalizeTextIdentifier(candidate) === normalizedIdentifier
      );
    }) ?? null
  );
}
