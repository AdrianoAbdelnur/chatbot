import type { Db } from "mongodb";

import { evaluateRegistryIdentity } from "./registry-identity.ts";
import type {
  OfflineMonitoringCatalogVehicle,
  OfflineMonitoringRegistryVehicle,
} from "./types.ts";

type RegistryCatalogIdentity = Pick<
  OfflineMonitoringRegistryVehicle,
  "vehicleId" | "system" | "plate" | "gpsId" | "companyName" | "companyKey" | "identityStatus"
>;

export const OFFLINE_MONITORING_REGISTRY_COLLECTION_NAME =
  "gps_offline_monitoring_registry";

type RegistryDocument = Omit<OfflineMonitoringRegistryVehicle, "vehicleId"> & {
  _id: string;
  schemaVersion: number;
};

function toRegistryVehicle(document: RegistryDocument): OfflineMonitoringRegistryVehicle {
  const { _id, schemaVersion, ...vehicle } = document;
  void schemaVersion;
  return { vehicleId: _id, ...vehicle };
}

function isNamespaceExists(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 48;
}

function registryValidator() {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "_id",
        "system",
        "plate",
        "gpsId",
        "companyName",
        "companyKey",
        "present",
        "enabled",
        "identityStatus",
        "firstSeenAt",
        "lastSeenAt",
        "schemaVersion",
      ],
      properties: {
        _id: { bsonType: "string" },
        system: { enum: ["CYBERMAPA"] },
        plate: { bsonType: "string" },
        gpsId: { bsonType: ["string", "null"] },
        companyName: { bsonType: "string" },
        companyKey: { bsonType: "string" },
        present: { bsonType: "bool" },
        enabled: { bsonType: "bool" },
        identityStatus: { enum: ["ok", "identityConflict"] },
        firstSeenAt: { bsonType: "date" },
        lastSeenAt: { bsonType: "date" },
        schemaVersion: { bsonType: "int" },
        migrationInitialized: { bsonType: "bool" },
      },
    },
  };
}

export function createRegistryStore(database: Db) {
  const collection = database.collection<RegistryDocument>(
    OFFLINE_MONITORING_REGISTRY_COLLECTION_NAME,
  );
  let schemaPromise: Promise<void> | null = null;

  async function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        try {
          await database.createCollection(OFFLINE_MONITORING_REGISTRY_COLLECTION_NAME, {
            validator: registryValidator(),
            validationLevel: "strict",
            validationAction: "error",
          });
        } catch (error) {
          if (!isNamespaceExists(error)) throw error;
          await database.command({
            collMod: OFFLINE_MONITORING_REGISTRY_COLLECTION_NAME,
            validator: registryValidator(),
            validationLevel: "strict",
            validationAction: "error",
          });
        }

        await Promise.all([
          collection.createIndex({ companyKey: 1, present: 1 }),
          collection.createIndex({ enabled: 1, present: 1 }),
        ]);
      })();
    }

    await schemaPromise;
  }

  async function lookup(vehicleId: string) {
    await ensureSchema();
    const document = await collection.findOne({ _id: vehicleId });
    return document ? toRegistryVehicle(document) : null;
  }

  async function upsertCatalogVehicle(
    input: OfflineMonitoringCatalogVehicle,
    suppliedIdentity?: RegistryCatalogIdentity,
  ) {
    await ensureSchema();
    const existing = await collection.findOne({
      _id: `CYBERMAPA:${input.plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")}`,
    });
    const identity = suppliedIdentity ?? evaluateRegistryIdentity({
      incoming: input,
      existing: existing
        ? {
            vehicleId: existing._id,
            gpsId: existing.gpsId,
            companyKey: existing.companyKey,
          }
        : undefined,
    });
    const now = new Date();

    await collection.updateOne(
      { _id: identity.vehicleId },
      {
        $set: {
          system: identity.system,
          plate: identity.plate,
          gpsId: identity.gpsId,
          companyName: identity.companyName,
          companyKey: identity.companyKey,
          present: true,
          identityStatus: identity.identityStatus,
          lastSeenAt: now,
          schemaVersion: 1,
        },
        $setOnInsert: { enabled: false, firstSeenAt: now },
      },
      { upsert: true },
    );

    return (await lookup(identity.vehicleId))!;
  }

  async function initializeLegacyMembership(input: OfflineMonitoringCatalogVehicle) {
    await ensureSchema();
    const vehicle = await upsertCatalogVehicle(input);
    await collection.updateOne(
      { _id: vehicle.vehicleId, migrationInitialized: { $ne: true } },
      { $set: { enabled: true, migrationInitialized: true } },
    );
  }

  async function markUnseen(vehicleIds: string[]) {
    await ensureSchema();
    await collection.updateMany(
      vehicleIds.length > 0 ? { _id: { $nin: vehicleIds } } : {},
      { $set: { present: false } },
    );
  }

  async function listByCompany(companyKey: string) {
    await ensureSchema();
    const documents = await collection
      .find({ companyKey, present: true })
      .sort({ plate: 1 })
      .toArray();
    return documents.map(toRegistryVehicle);
  }

  async function listCurrent() {
    await ensureSchema();
    const documents = await collection
      .find({ present: true })
      .sort({ companyName: 1, plate: 1 })
      .toArray();
    return documents.map(toRegistryVehicle);
  }

  async function listEnabled() {
    await ensureSchema();
    const documents = await collection
      .find({ enabled: true, identityStatus: "ok" })
      .sort({ companyKey: 1, plate: 1 })
      .toArray();
    return documents.map(toRegistryVehicle);
  }

  async function setMembership(vehicleId: string, enabled: boolean) {
    await ensureSchema();
    const result = await collection.findOneAndUpdate(
      { _id: vehicleId, present: true, identityStatus: "ok" },
      { $set: { enabled } },
      { returnDocument: "after" },
    );
    return result ? toRegistryVehicle(result) : null;
  }

  return {
    ensureSchema,
    lookup,
    upsertCatalogVehicle,
    initializeLegacyMembership,
    markUnseen,
    listCurrent,
    listByCompany,
    listEnabled,
    setMembership,
  };
}
