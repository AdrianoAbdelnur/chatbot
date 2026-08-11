import { readFileSync, writeFileSync } from "node:fs";

import { closeMongoConnection } from "../lib/mongodb.ts";
import { renderCoverageCertificate } from "../lib/certificates/renderer.ts";
import { getVehicleServiceFeatures } from "../lib/certificates/service-features-store.ts";
import {
  VEHICLE_SERVICE_FEATURE_KEYS,
  type VehicleServiceFeatures,
} from "../lib/certificates/types.ts";

const TEMPLATE_PATH = "templates/certificate-base.pdf";
const DEFAULT_PLATE = "JIO573";

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

function buildAllFeatures(): VehicleServiceFeatures {
  const features = {} as VehicleServiceFeatures;

  for (const key of VEHICLE_SERVICE_FEATURE_KEYS) {
    features[key] = true;
  }

  return features;
}

const plate = (getArgument("plate") ?? DEFAULT_PLATE).toUpperCase();
const useAllFeatures = process.argv.includes("--all-features");
const outputPath = getArgument("out") ?? `data/preview-${plate}.pdf`;

try {
  let features: VehicleServiceFeatures;

  if (useAllFeatures) {
    features = buildAllFeatures();
  } else {
    const records = await getVehicleServiceFeatures([plate]);
    const record = records.get(plate);

    if (!record) {
      throw new Error(
        `${plate} has no active service record. Run certificates:seed first.`,
      );
    }

    features = record.features;
  }

  const pdfBytes = await renderCoverageCertificate({
    plate,
    features,
    issuedAt: new Date(),
    templateBytes: readFileSync(TEMPLATE_PATH),
  });

  writeFileSync(outputPath, pdfBytes);
  console.log(`Wrote ${outputPath} for ${plate}.`);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "The preview failed.",
  );
  process.exitCode = 1;
} finally {
  await closeMongoConnection();
}
