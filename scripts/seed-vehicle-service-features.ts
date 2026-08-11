import { readFileSync } from "node:fs";

import { closeMongoConnection } from "../lib/mongodb.ts";
import { parseVehicleServiceFeaturesCsv } from "../lib/certificates/service-features-import.ts";
import {
  deactivateVehicleServiceFeaturesMissingFrom,
  upsertVehicleServiceFeatures,
} from "../lib/certificates/service-features-store.ts";

const DEFAULT_CSV_PATH = "data/vehicle-services.csv";

function getArgument(name: string) {
  const prefix = `--${name}=`;
  const inlineArgument = process.argv.find((argument) =>
    argument.startsWith(prefix),
  );

  if (inlineArgument) {
    return inlineArgument.slice(prefix.length);
  }

  const argumentIndex = process.argv.indexOf(`--${name}`);
  return argumentIndex >= 0 ? process.argv[argumentIndex + 1] : undefined;
}

/**
 * Excel exports the spreadsheet using a legacy code page, so a strict UTF-8
 * read fails. Falling back keeps accented company names readable.
 */
function decodeCsv(buffer: Buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

const dryRun = process.argv.includes("--dry-run");
const positionalPath = process.argv
  .slice(2)
  .find((argument) => !argument.startsWith("--"));
const csvPath = getArgument("file") ?? positionalPath ?? DEFAULT_CSV_PATH;

try {
  const result = parseVehicleServiceFeaturesCsv(
    decodeCsv(readFileSync(csvPath)),
  );

  console.log(`Source: ${csvPath}`);
  console.log(`Rows accepted: ${result.records.length}`);

  if (result.issues.length > 0) {
    console.log(`Issues: ${result.issues.length}`);

    for (const issue of result.issues) {
      console.log(`  line ${issue.line} [${issue.reason}] ${issue.detail}`);
    }
  }

  if (result.records.length === 0) {
    throw new Error("The spreadsheet produced no usable rows.");
  }

  if (dryRun) {
    console.log("Dry run: nothing was written.");
  } else {
    const summary = await upsertVehicleServiceFeatures(result.records);
    const deactivated = await deactivateVehicleServiceFeaturesMissingFrom(
      result.records.map((record) => record.plate),
    );

    console.log(
      `Created: ${summary.created}  Updated: ${summary.updated}  Unchanged: ${summary.unchanged}  Deactivated: ${deactivated}`,
    );
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "The seed failed unexpectedly.",
  );
  process.exitCode = 1;
} finally {
  await closeMongoConnection();
}
