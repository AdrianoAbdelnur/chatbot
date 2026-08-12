import type { Db } from "mongodb";

import { createRegistryStore } from "./registry-store.ts";
import type { OfflineMonitoringCatalogVehicle } from "./types.ts";

export const OFFLINE_MONITORING_MIGRATIONS_COLLECTION_NAME = "gps_offline_monitoring_migrations";

type MigrationDocument = { _id: string; createdAt: Date };

export function createMigrationPersistence(database: Db) {
  const markers = database.collection<MigrationDocument>(OFFLINE_MONITORING_MIGRATIONS_COLLECTION_NAME);
  const registry = createRegistryStore(database);

  return {
    async hasMarker(id: string) {
      return Boolean(await markers.findOne({ _id: id }));
    },
    async createMarker(id: string) {
      try {
        await markers.insertOne({ _id: id, createdAt: new Date() });
        return true;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) return false;
        throw error;
      }
    },
    async initializeMembership(vehicle: OfflineMonitoringCatalogVehicle) {
      return registry.initializeLegacyMembership(vehicle);
    },
  };
}
