import { FAQ_SOURCE_ENTRIES } from "../lib/faq/data.ts";
import {
  FAQ_EMBEDDING_DIMENSIONS,
  FAQ_EMBEDDING_MODEL,
  buildFaqDocumentEmbeddingText,
  generateFaqEmbedding,
} from "../lib/faq/embeddings.ts";
import {
  FAQ_COLLECTION_NAME,
  createFaqContentHash,
  ensureFaqVectorIndex,
  type StoredFaqEntry,
} from "../lib/faq/store.ts";
import {
  closeMongoConnection,
  getMongoDatabase,
} from "../lib/mongodb.ts";

async function seedFaqs() {
  const database = await getMongoDatabase();
  const collection = database.collection<StoredFaqEntry>(FAQ_COLLECTION_NAME);
  const existingEntries = await collection
    .find(
      {
        _id: {
          $in: FAQ_SOURCE_ENTRIES.map((entry) => entry.id),
        },
      },
      {
        projection: {
          contentHash: 1,
          embeddingModel: 1,
          embeddingDimensions: 1,
        },
      },
    )
    .toArray();
  const existingById = new Map(
    existingEntries.map((entry) => [entry._id, entry]),
  );
  const now = new Date();
  let unchangedCount = 0;
  let upsertedCount = 0;

  for (const entry of FAQ_SOURCE_ENTRIES) {
    const contentHash = createFaqContentHash(entry.question, entry.answer);
    const existing = existingById.get(entry.id);

    if (
      existing?.contentHash === contentHash &&
      existing.embeddingModel === FAQ_EMBEDDING_MODEL &&
      existing.embeddingDimensions === FAQ_EMBEDDING_DIMENSIONS
    ) {
      await collection.updateOne(
        { _id: entry.id },
        {
          $set: {
            active: true,
            updatedAt: now,
          },
        },
      );
      unchangedCount += 1;
      continue;
    }

    const embedding = await generateFaqEmbedding(
      buildFaqDocumentEmbeddingText(entry.question, entry.answer),
    );

    await collection.updateOne(
      { _id: entry.id },
      {
        $set: {
          category: entry.category,
          question: entry.question,
          answer: entry.answer,
          active: true,
          embedding,
          embeddingModel: FAQ_EMBEDDING_MODEL,
          embeddingDimensions: FAQ_EMBEDDING_DIMENSIONS,
          contentHash,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      {
        upsert: true,
      },
    );
    upsertedCount += 1;
  }

  const sourceIds = FAQ_SOURCE_ENTRIES.map((entry) => entry.id);
  const deactivatedResult = await collection.updateMany(
    {
      _id: {
        $nin: sourceIds,
      },
      active: true,
    },
    {
      $set: {
        active: false,
        updatedAt: now,
      },
    },
  );
  const indexCreated = await ensureFaqVectorIndex();

  console.log(
    JSON.stringify({
      total: FAQ_SOURCE_ENTRIES.length,
      upserted: upsertedCount,
      unchanged: unchangedCount,
      deactivated: deactivatedResult.modifiedCount,
      vectorIndexCreated: indexCreated,
    }),
  );
}

try {
  await seedFaqs();
} finally {
  await closeMongoConnection();
}
