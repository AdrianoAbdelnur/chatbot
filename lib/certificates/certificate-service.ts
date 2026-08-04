import { getCybermapaAuthorization } from "../cybermapa/access-store.ts";
import { getCybermapaVehicleReports } from "../cybermapa/services.ts";
import { addOutgoingMessage } from "../whatsapp-message-store.ts";
import {
  getWhatsAppMediaConfig,
  sendWhatsAppDocument,
  uploadWhatsAppDocument,
} from "../whatsapp-media.ts";

import { getCertificateReportWindowMinutes } from "./config.ts";
import {
  evaluateCertificateEligibility,
  type CertificateIneligibilityReason,
  type EligibleCertificateVehicle,
  type IneligibleCertificateVehicle,
} from "./eligibility.ts";
import {
  recordCertificateEmissions,
  type CertificateEmissionRecord,
} from "./emission-store.ts";
import { renderCoverageCertificate } from "./renderer.ts";
import { getVehicleServiceFeatures } from "./service-features-store.ts";
import { getCertificateTemplateBytes } from "./template.ts";

const MAX_PLATES_PER_REQUEST = 5;

export type IssuedCertificate = {
  plate: string;
  reportedAt: string;
};

export type CertificateFailure = {
  plate: string;
  reason: CertificateIneligibilityReason | "delivery_failed";
};

export type CertificateRequestResult =
  | { status: "not_authorized" }
  | { status: "invalid_request" }
  | { status: "service_unavailable" }
  | {
      status: "issued";
      issued: IssuedCertificate[];
      failed: CertificateFailure[];
    }
  | {
      status: "confirmation_required";
      eligible: string[];
      ineligible: IneligibleCertificateVehicle[];
    }
  | {
      status: "none_eligible";
      ineligible: CertificateFailure[];
    };

function normalizeRequestedPlates(requestedPlates: unknown) {
  if (!Array.isArray(requestedPlates)) {
    return null;
  }

  const plates = requestedPlates.filter(
    (plate): plate is string => typeof plate === "string",
  );

  if (plates.length === 0 || plates.length > MAX_PLATES_PER_REQUEST) {
    return null;
  }

  return plates;
}

/**
 * Cybermapa returns a malformed record for plates it does not know, which
 * makes the batch parser throw. One unknown vehicle must not take the whole
 * request down, so the batch is retried plate by plate.
 */
async function fetchReportsTolerantly(plates: string[]) {
  if (plates.length === 0) {
    return [];
  }

  try {
    return await getCybermapaVehicleReports(plates);
  } catch {
    const perPlateReports = await Promise.all(
      plates.map((plate) =>
        getCybermapaVehicleReports([plate]).catch(() => []),
      ),
    );

    return perPlateReports.flat();
  }
}

async function deliverCertificate(
  vehicle: EligibleCertificateVehicle,
  destination: string,
  issuedAt: Date,
  templateBytes: Uint8Array,
) {
  const pdfBytes = await renderCoverageCertificate({
    plate: vehicle.plate,
    features: vehicle.features,
    issuedAt,
    templateBytes,
  });
  const filename = `Certificado de cobertura ${vehicle.plate}.pdf`;
  const caption = `Certificado de cobertura ${vehicle.plate}`;
  const config = getWhatsAppMediaConfig();
  const mediaId = await uploadWhatsAppDocument(
    { bytes: pdfBytes, filename },
    config,
  );
  const messageId = await sendWhatsAppDocument(
    { to: destination, mediaId, filename, caption },
    config,
  );

  await addOutgoingMessage({
    id: messageId,
    to: destination,
    text: caption,
    createdAt: new Date().toISOString(),
  }).catch(() => undefined);

  return { mediaId, messageId };
}

/**
 * Verifies, issues, and delivers coverage certificates.
 *
 * A mixed batch is never issued silently: unless the sender already confirmed
 * through `allowPartial`, the caller is told which vehicles are missing so the
 * customer can decide. Every run re-checks Cybermapa live.
 */
export async function issueCoverageCertificates(input: {
  senderPhone: string;
  destination: string;
  requestedPlates: unknown;
  allowPartial?: boolean;
  now?: Date;
}): Promise<CertificateRequestResult> {
  const plates = normalizeRequestedPlates(input.requestedPlates);

  if (!plates) {
    return { status: "invalid_request" };
  }

  const now = input.now ?? new Date();

  try {
    const authorization = await getCybermapaAuthorization(
      input.senderPhone,
    );

    if (!authorization) {
      return { status: "not_authorized" };
    }

    // Only vehicles present in the spreadsheet can ever be certified, so
    // Cybermapa is asked about those alone.
    const serviceRecords = await getVehicleServiceFeatures(plates);
    const reports = await fetchReportsTolerantly([...serviceRecords.keys()]);
    const evaluation = evaluateCertificateEligibility({
      requestedPlates: plates,
      authorization,
      reports,
      serviceRecords,
      now,
      windowMinutes: getCertificateReportWindowMinutes(),
    });

    if (evaluation.status === "none_eligible") {
      return {
        status: "none_eligible",
        ineligible: evaluation.ineligible,
      };
    }

    if (
      evaluation.status === "partially_eligible" &&
      !input.allowPartial
    ) {
      return {
        status: "confirmation_required",
        eligible: evaluation.eligible.map((vehicle) => vehicle.plate),
        ineligible: evaluation.ineligible,
      };
    }

    const templateBytes = await getCertificateTemplateBytes();
    const emissions: CertificateEmissionRecord[] = [];
    const issued: IssuedCertificate[] = [];
    const failed: CertificateFailure[] = [];

    for (const vehicle of evaluation.eligible) {
      try {
        const delivery = await deliverCertificate(
          vehicle,
          input.destination,
          now,
          templateBytes,
        );

        issued.push({
          plate: vehicle.plate,
          reportedAt: vehicle.reportedAt,
        });
        emissions.push({
          senderPhone: input.senderPhone,
          plate: vehicle.plate,
          outcome: "issued",
          reportedAt: vehicle.reportedAt,
          mediaId: delivery.mediaId,
          messageId: delivery.messageId,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        failed.push({ plate: vehicle.plate, reason: "delivery_failed" });
        emissions.push({
          senderPhone: input.senderPhone,
          plate: vehicle.plate,
          outcome: "send_failed",
          reportedAt: vehicle.reportedAt,
          failureReason:
            error instanceof Error ? error.message : "Unknown failure.",
          createdAt: new Date().toISOString(),
        });
      }
    }

    for (const vehicle of evaluation.ineligible) {
      emissions.push({
        senderPhone: input.senderPhone,
        plate: vehicle.plate,
        outcome: vehicle.reason,
        createdAt: new Date().toISOString(),
      });
    }

    await recordCertificateEmissions(emissions).catch(() => undefined);

    if (issued.length === 0) {
      return {
        status: "none_eligible",
        ineligible: [...evaluation.ineligible, ...failed],
      };
    }

    return {
      status: "issued",
      issued,
      failed: [...evaluation.ineligible, ...failed],
    };
  } catch (error) {
    // Without this the generic reply hides the real cause from the logs.
    console.error("Coverage certificate request failed.", error);

    return { status: "service_unavailable" };
  }
}
