import assert from "node:assert/strict";
import test from "node:test";

import {
  FAQ_EMBEDDING_DIMENSIONS,
  FAQ_EMBEDDING_MODEL,
  buildFaqDocumentEmbeddingText,
  buildFaqQueryEmbeddingText,
  generateFaqEmbedding,
} from "../lib/faq/embeddings.ts";

test("FAQ embedding text distinguishes documents from queries", () => {
  assert.equal(
    buildFaqDocumentEmbeddingText(" ¿Cómo instalo? ", " Coordiná un turno. "),
    "title: ¿Cómo instalo? | text: Coordiná un turno.",
  );
  assert.equal(
    buildFaqQueryEmbeddingText(" ¿Cómo pongo el GPS? "),
    "task: question answering | query: ¿Cómo pongo el GPS?",
  );
});

test("Gemini embedding request uses the stable model and 768 dimensions", async () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const embedding = Array.from(
    { length: FAQ_EMBEDDING_DIMENSIONS },
    (_, index) => index / FAQ_EMBEDDING_DIMENSIONS,
  );
  let requestedUrl;
  let requestedBody;

  process.env.GEMINI_API_KEY = "test-api-key";

  try {
    const result = await generateFaqEmbedding(
      "query text",
      async (input, init) => {
        requestedUrl = input;
        requestedBody = JSON.parse(init.body);
        return Response.json({
          embedding: {
            values: embedding,
          },
        });
      },
    );

    assert.equal(
      requestedUrl,
      `https://generativelanguage.googleapis.com/v1beta/models/${FAQ_EMBEDDING_MODEL}:embedContent`,
    );
    assert.equal(
      requestedBody.output_dimensionality,
      FAQ_EMBEDDING_DIMENSIONS,
    );
    assert.equal(requestedBody.content.parts[0].text, "query text");
    assert.deepEqual(result, embedding);
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
  }
});

test("Gemini embedding response must have the configured dimensions", async () => {
  const originalApiKey = process.env.GEMINI_API_KEY;

  process.env.GEMINI_API_KEY = "test-api-key";

  try {
    await assert.rejects(
      generateFaqEmbedding("query", async () =>
        Response.json({
          embedding: {
            values: [0.1, 0.2],
          },
        }),
      ),
      /invalid embedding/,
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }
  }
});
