import { validateVehiclePlate } from "../cybermapa/normalizers.ts";

import {
  VEHICLE_SERVICE_FEATURE_KEYS,
  type VehicleServiceFeatureKey,
  type VehicleServiceFeatures,
} from "./types.ts";

export type ImportedVehicleServiceRecord = {
  plate: string;
  companyName: string;
  features: VehicleServiceFeatures;
};

export type VehicleServiceImportIssue = {
  line: number;
  reason:
    | "invalid_plate"
    | "conflicting_duplicate_plate"
    | "unrecognized_flag_value";
  detail: string;
};

export type VehicleServiceImportResult = {
  records: ImportedVehicleServiceRecord[];
  issues: VehicleServiceImportIssue[];
};

type ColumnKey = VehicleServiceFeatureKey | "companyName" | "plate";

/**
 * Headers are matched by normalized prefix so the import survives the
 * legacy code page Excel uses when exporting (where "Ñ" arrives mangled).
 */
const COLUMN_HEADER_PREFIXES: Record<ColumnKey, string> = {
  companyName: "EMPRESA",
  plate: "PATENTE",
  powerCut: "CORTE",
  panicAlarm: "PANICO",
  driverDoorSensor: "SENSORDEPUERTADECHOFER",
  passengerDoorSensor: "SENSORDEPUERTADEACOMPA",
  sideDoorSensor: "SENSORDEPUERTALATERAL",
  rearDoorSensor: "SENSORDEPUERTATRASERA",
  hitchSensor: "SENSORDEENGANCHEDESENGANCHE",
  canbusReading: "LECTURACANBUS",
  wifiConnectivity: "CONECTIVIDADWIFI",
};

const AFFIRMATIVE_FLAG = "SI";
const NEGATIVE_FLAGS = new Set(["NO", "", "-", "--", "N/A", "NA"]);

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function normalizeHeader(value: string) {
  return stripDiacritics(value.trim().toUpperCase()).replace(
    /[^A-Z0-9]/g,
    "",
  );
}

function detectDelimiter(headerLine: string) {
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;

  return semicolons >= commas ? ";" : ",";
}

function parseDelimitedRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let index = 0;

  function endField() {
    currentRow.push(currentField);
    currentField = "";
  }

  function endRow() {
    endField();
    rows.push(currentRow);
    currentRow = [];
  }

  while (index < text.length) {
    const character = text[index];

    if (insideQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          currentField += '"';
          index += 2;
          continue;
        }

        insideQuotes = false;
        index += 1;
        continue;
      }

      currentField += character;
      index += 1;
      continue;
    }

    if (character === '"') {
      insideQuotes = true;
      index += 1;
      continue;
    }

    if (character === delimiter) {
      endField();
      index += 1;
      continue;
    }

    if (character === "\r" && text[index + 1] === "\n") {
      endRow();
      index += 2;
      continue;
    }

    if (character === "\n" || character === "\r") {
      endRow();
      index += 1;
      continue;
    }

    currentField += character;
    index += 1;
  }

  if (currentField !== "" || currentRow.length > 0) {
    endRow();
  }

  return rows;
}

function buildColumnIndexes(headerRow: string[]) {
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const columnIndexes = {} as Record<ColumnKey, number>;
  const missingColumns: string[] = [];

  for (const [columnKey, prefix] of Object.entries(
    COLUMN_HEADER_PREFIXES,
  ) as Array<[ColumnKey, string]>) {
    const index = normalizedHeaders.findIndex((header) =>
      header.startsWith(prefix),
    );

    if (index === -1) {
      missingColumns.push(prefix);
      continue;
    }

    columnIndexes[columnKey] = index;
  }

  if (missingColumns.length > 0) {
    throw new Error(
      `The spreadsheet is missing required columns: ${missingColumns.join(", ")}.`,
    );
  }

  return columnIndexes;
}

function collapseSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function parseVehicleServiceFeaturesCsv(
  text: string,
): VehicleServiceImportResult {
  const content =
    text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const rows = parseDelimitedRows(content, detectDelimiter(firstLine));
  const [headerRow, ...dataRows] = rows;

  if (!headerRow) {
    throw new Error("The spreadsheet is empty.");
  }

  const columnIndexes = buildColumnIndexes(headerRow);
  const issues: VehicleServiceImportIssue[] = [];
  const recordsByPlate = new Map<string, ImportedVehicleServiceRecord>();
  const conflictingPlates = new Set<string>();

  dataRows.forEach((row, rowIndex) => {
    const line = rowIndex + 2;

    if (row.every((field) => field.trim() === "")) {
      return;
    }

    const plate = validateVehiclePlate(row[columnIndexes.plate] ?? "");

    if (!plate) {
      issues.push({
        line,
        reason: "invalid_plate",
        detail: `"${collapseSpaces(row[columnIndexes.plate] ?? "")}" is not a usable plate.`,
      });
      return;
    }

    const features = {} as VehicleServiceFeatures;

    for (const featureKey of VEHICLE_SERVICE_FEATURE_KEYS) {
      const rawValue = (row[columnIndexes[featureKey]] ?? "").trim();
      const normalizedValue = stripDiacritics(
        rawValue.toUpperCase(),
      ).replace(/[^A-Z0-9/]/g, "");

      if (normalizedValue === AFFIRMATIVE_FLAG) {
        features[featureKey] = true;
        continue;
      }

      features[featureKey] = false;

      if (!NEGATIVE_FLAGS.has(normalizedValue) && rawValue !== "-") {
        issues.push({
          line,
          reason: "unrecognized_flag_value",
          detail: `${plate}: "${rawValue}" in ${featureKey} was read as not installed.`,
        });
      }
    }

    const record: ImportedVehicleServiceRecord = {
      plate,
      companyName: collapseSpaces(row[columnIndexes.companyName] ?? ""),
      features,
    };
    const existingRecord = recordsByPlate.get(plate);

    if (!existingRecord) {
      recordsByPlate.set(plate, record);
      return;
    }

    const isIdentical =
      existingRecord.companyName === record.companyName &&
      VEHICLE_SERVICE_FEATURE_KEYS.every(
        (key) => existingRecord.features[key] === record.features[key],
      );

    if (isIdentical) {
      return;
    }

    // An ambiguous plate must not reach a certificate. Drop every copy.
    recordsByPlate.delete(plate);
    conflictingPlates.add(plate);
    issues.push({
      line,
      reason: "conflicting_duplicate_plate",
      detail: `${plate} appears more than once with different data. Every copy was discarded.`,
    });
  });

  for (const plate of conflictingPlates) {
    recordsByPlate.delete(plate);
  }

  return {
    records: [...recordsByPlate.values()],
    issues,
  };
}
