import { randomUUID } from "node:crypto";

import { MongoClient, type Db } from "mongodb";

// MongoDB database names are limited to 38 bytes. Keep this safety prefix
// short enough for the random suffix while remaining unmistakable.
export const TEST_DATABASE_PREFIX = "om_it_";

export type MongoIntegrationClient = Pick<MongoClient, "close" | "db">;

type IsolatedDatabaseOptions<T> = {
  uri: string;
  createClient?: (uri: string) => Promise<MongoIntegrationClient>;
  dropDatabase?: (database: Db) => Promise<void>;
  run: (database: Db) => Promise<T>;
};

export function createTestDatabaseName() {
  return `${TEST_DATABASE_PREFIX}${randomUUID().replaceAll("-", "")}`;
}

export function assertTestDatabaseName(databaseName: string) {
  if (!databaseName.startsWith(TEST_DATABASE_PREFIX)) {
    throw new Error(
      `Refusing to clean a non-test MongoDB database: ${databaseName}`,
    );
  }
}

export function isMongoIntegrationUriConfigured() {
  return Boolean(process.env.MONGO_INTEGRATION_TEST_URI);
}

export function getMongoIntegrationTestUri() {
  const uri = process.env.MONGO_INTEGRATION_TEST_URI;

  if (!uri) {
    throw new Error(
      "MONGO_INTEGRATION_TEST_URI is required to run Mongo integration tests.",
    );
  }

  return uri;
}

export async function withIsolatedMongoDatabase<T>({
  uri,
  createClient = async (connectionUri) => MongoClient.connect(connectionUri),
  dropDatabase = async (database) => {
    await database.dropDatabase();
  },
  run,
}: IsolatedDatabaseOptions<T>) {
  const databaseName = createTestDatabaseName();
  assertTestDatabaseName(databaseName);

  const client = await createClient(uri);
  const database = client.db(databaseName);

  try {
    return await run(database);
  } finally {
    try {
      assertTestDatabaseName(databaseName);
      await dropDatabase(database);
    } finally {
      await client.close();
    }
  }
}
