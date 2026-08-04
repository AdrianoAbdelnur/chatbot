import type { AnyBulkWriteOperation } from "mongodb";

import { getMongoDatabase } from "../mongodb.ts";
import { validateVehiclePlate } from "../cybermapa/normalizers.ts";

import {
  VEHICLE_SERVICE_FEATURE_KEYS,
  type VehicleServiceFeatures,
  type VehicleServiceRecord,
} from "./types.ts";

export const VEHICLE_SERVICE_FEATURE_COLLECTION_NAME =
  "vehicle_service_features";

export type VehicleServiceFeatureDocument = {
  _id: string;
  companyName: string;
  features: Record<string, unknown>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VehicleServiceFeatureInput = {
  plate: string;
  companyName: string;
  features: VehicleServiceFeatures;
};

export type VehicleServiceFeatureSyncSummary = {
  created: number;
  updated: number;
  unchanged: number;
};

/**
 * A missing or non-boolean flag is treated as "not installed". A certificate
 * must never claim a service that the source data does not confirm.
 */
function readFeatures(
  rawFeatures: VehicleServiceFeatureDocument["features"],
): VehicleServiceFeatures {
  const features = {} as VehicleServiceFeatures;

  for (const key of VEHICLE_SERVICE_FEATURE_KEYS) {
    features[key] = rawFeatures?.[key] === true;
  }

  return features;
}

function featuresAreEqual(
  left: VehicleServiceFeatures,
  right: VehicleServiceFeatures,
) {
  return VEHICLE_SERVICE_FEATURE_KEYS.every(
    (key) => left[key] === right[key],
  );
}

function toVehicleServiceRecord(
  document: VehicleServiceFeatureDocument,
): VehicleServiceRecord {
  return {
    plate: document._id,
    companyName: document.companyName ?? "",
    features: readFeatures(document.features),
    updatedAt: document.updatedAt,
  };
}

export function normalizeServiceFeaturePlates(plates: string[]) {
  return [
    ...new Set(
      plates
        .map(validateVehiclePlate)
        .filter((plate): plate is string => Boolean(plate)),
    ),
  ];
}

/**
 * Returns the active service record for each requested plate, keyed by
 * normalized plate. Plates without an active record are simply absent.
 */
export async function getVehicleServiceFeatures(plates: string[]) {
  const normalizedPlates = normalizeServiceFeaturePlates(plates);
  const recordsByPlate = new Map<string, VehicleServiceRecord>();

  if (normalizedPlates.length === 0) {
    return recordsByPlate;
  }

  const database = await getMongoDatabase();
  const documents = await database
    .collection<VehicleServiceFeatureDocument>(
      VEHICLE_SERVICE_FEATURE_COLLECTION_NAME,
    )
    .find({
      _id: { $in: normalizedPlates },
      active: true,
    })
    .toArray();

  for (const document of documents) {
    recordsByPlate.set(document._id, toVehicleServiceRecord(document));
  }

  return recordsByPlate;
}

/**
 * Writes only the records that actually differ from what is stored, so the
 * reported counts describe real changes instead of rewrite noise.
 */
export async function upsertVehicleServiceFeatures(
  records: VehicleServiceFeatureInput[],
): Promise<VehicleServiceFeatureSyncSummary> {
  const summary: VehicleServiceFeatureSyncSummary = {
    created: 0,
    updated: 0,
    unchanged: 0,
  };

  if (records.length === 0) {
    return summary;
  }

  const database = await getMongoDatabase();
  const collection = database.collection<VehicleServiceFeatureDocument>(
    VEHICLE_SERVICE_FEATURE_COLLECTION_NAME,
  );
  const existingDocuments = await collection
    .find({ _id: { $in: records.map((record) => record.plate) } })
    .toArray();
  const existingByPlate = new Map(
    existingDocuments.map((document) => [document._id, document]),
  );
  const now = new Date().toISOString();
  const operations: AnyBulkWriteOperation<VehicleServiceFeatureDocument>[] =
    [];

  for (const record of records) {
    const existingDocument = existingByPlate.get(record.plate);

    if (existingDocument) {
      const isUnchanged =
        existingDocument.active === true &&
        existingDocument.companyName === record.companyName &&
        featuresAreEqual(
          readFeatures(existingDocument.features),
          record.features,
        );

      if (isUnchanged) {
        summary.unchanged += 1;
        continue;
      }

      summary.updated += 1;
    } else {
      summary.created += 1;
    }

    operations.push({
      updateOne: {
        filter: { _id: record.plate },
        update: {
          $set: {
            companyName: record.companyName,
            features: record.features,
            active: true,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    });
  }

  if (operations.length > 0) {
    await collection.bulkWrite(operations, { ordered: false });
  }

  return summary;
}

/**
 * Plates removed from the source spreadsheet are deactivated, never deleted,
 * so past certificate emissions remain auditable.
 */
export async function deactivateVehicleServiceFeaturesMissingFrom(
  plates: string[],
) {
  const database = await getMongoDatabase();
  const result = await database
    .collection<VehicleServiceFeatureDocument>(
      VEHICLE_SERVICE_FEATURE_COLLECTION_NAME,
    )
    .updateMany(
      {
        _id: { $nin: plates },
        active: true,
      },
      {
        $set: {
          active: false,
          updatedAt: new Date().toISOString(),
        },
      },
    );

  return result.modifiedCount;
}
