import { createHash } from "node:crypto";
import type { Document } from "mongodb";
import { getMongoDatabase } from "../mongodb.ts";
import {
  FAQ_EMBEDDING_DIMENSIONS,
  FAQ_EMBEDDING_MODEL,
  buildFaqQueryEmbeddingText,
  generateFaqEmbedding,
} from "./embeddings.ts";

export const FAQ_COLLECTION_NAME = "faq_entries";
export const FAQ_VECTOR_INDEX_NAME = "faq_vector_index";
export const FAQ_MINIMUM_SCORE = 0.72;

export type StoredFaqEntry = {
  _id: string;
  category: string;
  question: string;
  answer: string;
  active: boolean;
  embedding: number[];
  embeddingModel: string;
  embeddingDimensions: number;
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
};

type FaqSearchMatch = {
  question: string;
  answer: string;
  category: string;
  score: number;
};

export function createFaqContentHash(question: string, answer: string) {
  return createHash("sha256")
    .update(`${question.trim()}\n${answer.trim()}`, "utf8")
    .digest("hex");
}

export function buildFaqVectorSearchPipeline(
  queryVector: number[],
  limit = 3,
): Document[] {
  return [
    {
      $vectorSearch: {
        index: FAQ_VECTOR_INDEX_NAME,
        path: "embedding",
        queryVector,
        exact: true,
        limit,
        filter: {
          active: true,
        },
      },
    },
    {
      $project: {
        _id: 0,
        question: 1,
        answer: 1,
        category: 1,
        score: {
          $meta: "vectorSearchScore",
        },
      },
    },
  ];
}

export async function ensureFaqVectorIndex() {
  const database = await getMongoDatabase();
  const collection = database.collection<StoredFaqEntry>(FAQ_COLLECTION_NAME);
  const existingIndexes = await collection
    .listSearchIndexes(FAQ_VECTOR_INDEX_NAME)
    .toArray();

  if (existingIndexes.length > 0) {
    return false;
  }

  await collection.createSearchIndex({
    name: FAQ_VECTOR_INDEX_NAME,
    type: "vectorSearch",
    definition: {
      fields: [
        {
          type: "vector",
          path: "embedding",
          numDimensions: FAQ_EMBEDDING_DIMENSIONS,
          similarity: "dotProduct",
        },
        {
          type: "filter",
          path: "active",
        },
      ],
    },
  });

  return true;
}

export async function searchFaqForAgent(query: unknown) {
  if (typeof query !== "string" || !query.trim()) {
    return {
      status: "invalid_query",
      matches: [],
    };
  }

  try {
    const queryVector = await generateFaqEmbedding(
      buildFaqQueryEmbeddingText(query.slice(0, 1_000)),
    );
    const database = await getMongoDatabase();
    const matches = await database
      .collection<StoredFaqEntry>(FAQ_COLLECTION_NAME)
      .aggregate<FaqSearchMatch>(
        buildFaqVectorSearchPipeline(queryVector),
      )
      .toArray();
    const relevantMatches = matches.filter(
      (match) =>
        typeof match.score === "number" &&
        match.score >= FAQ_MINIMUM_SCORE,
    );

    if (relevantMatches.length === 0) {
      return {
        status: "no_match",
        matches: [],
      };
    }

    return {
      status: "ok",
      matches: relevantMatches,
    };
  } catch {
    return {
      status: "service_unavailable",
      matches: [],
    };
  }
}

export const FAQ_EMBEDDING_METADATA = {
  model: FAQ_EMBEDDING_MODEL,
  dimensions: FAQ_EMBEDDING_DIMENSIONS,
};
