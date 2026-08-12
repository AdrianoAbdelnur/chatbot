import assert from "node:assert/strict";
import test from "node:test";

import { getMongoIntegrationTestUri, withIsolatedMongoDatabase } from "../../lib/test-support/mongo-integration.ts";
import {
  createCheckHistoryStore,
  OFFLINE_CHECK_EXECUTIONS_COLLECTION_NAME,
  OFFLINE_CHECK_OUTCOMES_COLLECTION_NAME,
} from "../../lib/offline-monitoring/check-history-store.ts";

const target = { vehicleId: "CYBERMAPA:AB123CD", companyKey: "ACME" };

test("check history store installs bounded collections, indexes, and no TTL", async () => {
  await withIsolatedMongoDatabase({
    uri: getMongoIntegrationTestUri(),
    run: async (database) => {
      const store = createCheckHistoryStore(database);
      await store.ensureSchema();
      const executionIndexes = await database.collection(OFFLINE_CHECK_EXECUTIONS_COLLECTION_NAME).indexes();
      const outcomeIndexes = await database.collection(OFFLINE_CHECK_OUTCOMES_COLLECTION_NAME).indexes();

      assert.ok(executionIndexes.some((index) => JSON.stringify(index.key) === JSON.stringify({ source: 1, startedAt: -1 })));
      assert.ok(outcomeIndexes.some((index) => JSON.stringify(index.key) === JSON.stringify({ executionId: 1, vehicleId: 1 })));
      assert.ok(outcomeIndexes.some((index) => JSON.stringify(index.key) === JSON.stringify({ executionId: 1 })));
      assert.ok([...executionIndexes, ...outcomeIndexes].every((index) => !index.expireAfterSeconds));
      await assert.rejects(() => database.collection(OFFLINE_CHECK_EXECUTIONS_COLLECTION_NAME).insertOne({ _id: "bad" }));
    },
  });
});

test("check history store starts, upserts, finalizes, and resumes idempotently", async () => {
  await withIsolatedMongoDatabase({
    uri: getMongoIntegrationTestUri(),
    run: async (database) => {
      const store = createCheckHistoryStore(database);
      const first = await store.startExecution({
        executionId: "manual:key-1",
        source: "manual",
        requestedVehicles: [target, target],
      });
      const resumed = await store.startExecution({
        executionId: "manual:key-1",
        source: "manual",
        requestedVehicles: [target],
      });
      assert.equal(first._id, resumed._id);
      await Promise.all([
        store.upsertOutcome("manual:key-1", { ...target, outcome: "reporting", observation: { plate: "AB123CD" } }),
        store.upsertOutcome("manual:key-1", { ...target, outcome: "delayed", observation: { plate: "AB123CD" } }),
      ]);
      const finalized = await store.finalizeExecution("manual:key-1");
      assert.equal(finalized.status, "completed");
      assert.equal(finalized.requestedCount, 1);
      assert.equal((await store.listOutcomes("manual:key-1")).length, 1);
    },
  });
});
