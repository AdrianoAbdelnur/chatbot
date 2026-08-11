import { getMongoDatabase } from "../mongodb.ts";

import type { OperatorActor } from "./types.ts";

export const OPERATOR_COLLECTION_NAME = "gps_operators";

type OperatorDocument = {
  _id: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

let operatorIndexesPromise: Promise<string[]> | null = null;

async function ensureOperatorIndexes() {
  if (!operatorIndexesPromise) {
    operatorIndexesPromise = getMongoDatabase().then((database) => {
      const collection = database.collection<OperatorDocument>(
        OPERATOR_COLLECTION_NAME,
      );

      return Promise.all([collection.createIndex({ enabled: 1, name: 1 })]);
    });
  }

  await operatorIndexesPromise;
}

function toOperatorActor(document: OperatorDocument): OperatorActor {
  return {
    id: document._id,
    name: document.name,
  };
}

export async function listOperators(): Promise<OperatorActor[]> {
  await ensureOperatorIndexes();

  const database = await getMongoDatabase();
  const documents = await database
    .collection<OperatorDocument>(OPERATOR_COLLECTION_NAME)
    .find({ enabled: true })
    .sort({ name: 1 })
    .toArray();

  return documents.map(toOperatorActor);
}

export async function upsertOperator(input: {
  id: string;
  name: string;
  enabled?: boolean;
}): Promise<string> {
  const id = input.id.trim();
  const name = input.name.trim().replace(/\s+/g, " ");

  if (!id) {
    throw new Error("The operator id is required.");
  }

  if (!name) {
    throw new Error("The operator name is required.");
  }

  await ensureOperatorIndexes();

  const now = new Date().toISOString();
  const database = await getMongoDatabase();

  await database
    .collection<OperatorDocument>(OPERATOR_COLLECTION_NAME)
    .updateOne(
      { _id: id },
      {
        $set: {
          name,
          enabled: input.enabled ?? true,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true },
    );

  return id;
}

export async function findOperatorById(
  operatorId: string,
): Promise<OperatorActor | null> {
  // A disabled operator reads as unknown so that retiring someone never
  // orphans the audit rows that already reference their id.
  if (!operatorId) {
    return null;
  }

  const database = await getMongoDatabase();
  const document = await database
    .collection<OperatorDocument>(OPERATOR_COLLECTION_NAME)
    .findOne({ _id: operatorId, enabled: true });

  return document ? toOperatorActor(document) : null;
}
