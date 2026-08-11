import { getMongoDatabase } from "../mongodb.ts";

import type { CertificateIneligibilityReason } from "./eligibility.ts";

export const CERTIFICATE_EMISSION_COLLECTION_NAME =
  "certificate_emissions";

export type CertificateEmissionRecord = {
  senderPhone: string;
  plate: string;
  outcome: "issued" | CertificateIneligibilityReason | "send_failed";
  createdAt: string;
  /** The Cybermapa report the certificate was based on. */
  reportedAt?: string;
  mediaId?: string;
  messageId?: string;
  failureReason?: string;
};

let emissionIndexesPromise: Promise<string[]> | null = null;

async function ensureEmissionIndexes() {
  if (!emissionIndexesPromise) {
    emissionIndexesPromise = getMongoDatabase().then((database) => {
      const collection =
        database.collection<CertificateEmissionRecord>(
          CERTIFICATE_EMISSION_COLLECTION_NAME,
        );

      return Promise.all([
        collection.createIndex({ senderPhone: 1, createdAt: -1 }),
        collection.createIndex({ plate: 1, createdAt: -1 }),
      ]);
    });
  }

  await emissionIndexesPromise;
}

/**
 * Every issued certificate is recorded with the report that backed it, so a
 * document can be traced back to the evidence available when it was signed.
 */
export async function recordCertificateEmissions(
  records: CertificateEmissionRecord[],
) {
  if (records.length === 0) {
    return;
  }

  await ensureEmissionIndexes();
  const database = await getMongoDatabase();

  await database
    .collection<CertificateEmissionRecord>(
      CERTIFICATE_EMISSION_COLLECTION_NAME,
    )
    .insertMany(records);
}
