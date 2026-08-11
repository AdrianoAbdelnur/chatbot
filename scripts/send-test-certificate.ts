import { readFileSync } from "node:fs";

import { closeMongoConnection } from "../lib/mongodb.ts";
import { renderCoverageCertificate } from "../lib/certificates/renderer.ts";
import { getVehicleServiceFeatures } from "../lib/certificates/service-features-store.ts";
import {
  getWhatsAppMediaConfig,
  sendWhatsAppDocument,
  uploadWhatsAppDocument,
} from "../lib/whatsapp-media.ts";

const TEMPLATE_PATH = "templates/certificate-base.pdf";

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

const to = (getArgument("to") ?? "").replace(/\D/g, "");
const plate = (getArgument("plate") ?? "").toUpperCase();

if (!to || !plate) {
  console.error(
    "Usage: npm run certificates:send -- --to 549381XXXXXXX --plate JIO573",
  );
  process.exitCode = 1;
} else {
  try {
    const records = await getVehicleServiceFeatures([plate]);
    const record = records.get(plate);

    if (!record) {
      throw new Error(
        `${plate} has no active service record. Run certificates:seed first.`,
      );
    }

    const pdfBytes = await renderCoverageCertificate({
      plate,
      features: record.features,
      issuedAt: new Date(),
      templateBytes: readFileSync(TEMPLATE_PATH),
    });
    const filename = `Certificado de cobertura ${plate}.pdf`;
    const config = getWhatsAppMediaConfig();
    const mediaId = await uploadWhatsAppDocument(
      { bytes: pdfBytes, filename },
      config,
    );

    console.log(`Uploaded media ${mediaId}.`);

    const messageId = await sendWhatsAppDocument(
      {
        to,
        mediaId,
        filename,
        caption: `Certificado de cobertura ${plate}`,
      },
      config,
    );

    console.log(`Meta accepted the document as ${messageId}.`);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "The test send failed.",
    );
    process.exitCode = 1;
  } finally {
    await closeMongoConnection();
  }
}
