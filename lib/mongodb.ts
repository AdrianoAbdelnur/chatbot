import { MongoClient } from "mongodb";

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

function getMongoClientPromise() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (!globalForMongo.mongoClientPromise) {
    const client = new MongoClient(uri);
    globalForMongo.mongoClientPromise = client.connect();
  }

  return globalForMongo.mongoClientPromise;
}

export async function getMongoDatabase() {
  const databaseName = process.env.MONGODB_DATABASE;

  if (!databaseName) {
    throw new Error("MONGODB_DATABASE is not configured.");
  }

  const client = await getMongoClientPromise();
  return client.db(databaseName);
}

export async function closeMongoConnection() {
  const clientPromise = globalForMongo.mongoClientPromise;

  globalForMongo.mongoClientPromise = undefined;

  if (clientPromise) {
    const client = await clientPromise;
    await client.close();
  }
}
