import assert from "node:assert/strict";
import test from "node:test";

import { withIsolatedMongoDatabase, getMongoIntegrationTestUri } from "../../lib/test-support/mongo-integration.ts";
import { createRegistryStore, OFFLINE_MONITORING_REGISTRY_COLLECTION_NAME } from "../../lib/offline-monitoring/registry-store.ts";

test("registry store installs its validator and required indexes with BSON dates", async () => {
  await withIsolatedMongoDatabase({
    uri: getMongoIntegrationTestUri(),
    run: async (database) => {
      const store = createRegistryStore(database);
      await store.ensureSchema();
      await store.upsertCatalogVehicle({ system: "CYBERMAPA", plate: "AB123CD", gpsId: "gps-1", companyName: "Company" });
      const document = await database.collection(OFFLINE_MONITORING_REGISTRY_COLLECTION_NAME).findOne({ _id: "CYBERMAPA:AB123CD" });
      const indexes = await database.collection(OFFLINE_MONITORING_REGISTRY_COLLECTION_NAME).indexes();

      assert.ok(document.firstSeenAt instanceof Date);
      assert.ok(document.lastSeenAt instanceof Date);
      assert.ok(indexes.some((index) => JSON.stringify(index.key) === JSON.stringify({ companyKey: 1, present: 1 })));
      assert.ok(indexes.some((index) => JSON.stringify(index.key) === JSON.stringify({ enabled: 1, present: 1 })));
    },
  });
});

test("registry store rejects malformed documents and preserves membership during catalog refresh", async () => {
  await withIsolatedMongoDatabase({
    uri: getMongoIntegrationTestUri(),
    run: async (database) => {
      const store = createRegistryStore(database);
      await store.ensureSchema();
      await assert.rejects(
        () => database.collection(OFFLINE_MONITORING_REGISTRY_COLLECTION_NAME).insertOne({ _id: "bad" }),
      );
      await store.upsertCatalogVehicle({ system: "CYBERMAPA", plate: "AB123CD", gpsId: "gps-1", companyName: "Company" });
      await store.setMembership("CYBERMAPA:AB123CD", true);
      await store.upsertCatalogVehicle({ system: "CYBERMAPA", plate: "AB123CD", gpsId: "gps-1", companyName: "Moved Company" });
      const document = await store.lookup("CYBERMAPA:AB123CD");

      assert.equal(document.enabled, true);
      assert.equal(document.companyKey, "MOVED COMPANY");
      await assert.rejects(
        () => database.collection(OFFLINE_MONITORING_REGISTRY_COLLECTION_NAME).insertOne({ ...document }),
      );
    },
  });
});

test("registry membership updates are atomic and never mutate unrelated incident bytes", async () => {
  await withIsolatedMongoDatabase({
    uri: getMongoIntegrationTestUri(),
    run: async (database) => {
      const store = createRegistryStore(database);
      await Promise.all([
        store.upsertCatalogVehicle({ system: "CYBERMAPA", plate: "AB123CD", gpsId: "gps-1", companyName: "Company" }),
        store.upsertCatalogVehicle({ system: "CYBERMAPA", plate: "AC123CD", gpsId: "gps-2", companyName: "Company" }),
      ]);
      const incidents = database.collection("gps_offline_incidents");
      await incidents.insertOne({ _id: "incident-1", bytes: "unchanged" });
      await Promise.all([
        store.setMembership("CYBERMAPA:AB123CD", true),
        store.setMembership("CYBERMAPA:AC123CD", true),
      ]);
      await Promise.all([
        store.setMembership("CYBERMAPA:AB123CD", false),
        store.setMembership("CYBERMAPA:AB123CD", true),
      ]);
      assert.equal((await store.lookup("CYBERMAPA:AC123CD")).enabled, true);
      assert.equal((await incidents.findOne({ _id: "incident-1" })).bytes, "unchanged");
    },
  });
});
