import assert from "node:assert/strict";
import test from "node:test";

import {
  TEST_DATABASE_PREFIX,
  assertTestDatabaseName,
  createTestDatabaseName,
  isMongoIntegrationUriConfigured,
  withIsolatedMongoDatabase,
} from "../../lib/test-support/mongo-integration.ts";

test("the Mongo integration harness creates and cleans an isolated prefixed database", async () => {
  const dropped = [];
  const client = {
    db(name) {
      return { databaseName: name };
    },
    async close() {},
  };

  const result = await withIsolatedMongoDatabase({
    uri: "mongodb://integration-test.invalid",
    createClient: async () => client,
    dropDatabase: async (database) => {
      dropped.push(database.databaseName);
    },
    run: async (database) => database.databaseName,
  });

  assert.ok(result.startsWith(TEST_DATABASE_PREFIX));
  assert.deepEqual(dropped, [result]);
});

test("the Mongo integration harness rejects destructive cleanup outside its fixed test prefix", () => {
  assert.throws(
    () => assertTestDatabaseName("whatsapp_backend"),
    /Refusing to clean a non-test MongoDB database/,
  );
  assert.ok(createTestDatabaseName().startsWith(TEST_DATABASE_PREFIX));
});

test("the harness exposes the dedicated URI only when explicitly configured", () => {
  const previousUri = process.env.MONGO_INTEGRATION_TEST_URI;

  try {
    delete process.env.MONGO_INTEGRATION_TEST_URI;
    assert.equal(isMongoIntegrationUriConfigured(), false);

    process.env.MONGO_INTEGRATION_TEST_URI = "mongodb://integration-test.invalid";
    assert.equal(isMongoIntegrationUriConfigured(), true);
  } finally {
    if (previousUri === undefined) {
      delete process.env.MONGO_INTEGRATION_TEST_URI;
    } else {
      process.env.MONGO_INTEGRATION_TEST_URI = previousUri;
    }
  }
});
