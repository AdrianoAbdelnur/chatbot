import assert from "node:assert/strict";
import test from "node:test";

import {
  FAQ_MINIMUM_SCORE,
  FAQ_VECTOR_INDEX_NAME,
  buildFaqVectorSearchPipeline,
  createFaqContentHash,
} from "../lib/faq/store.ts";

test("FAQ vector search uses exact search and filters inactive entries", () => {
  const queryVector = [0.1, 0.2, 0.3];
  const pipeline = buildFaqVectorSearchPipeline(queryVector);

  assert.deepEqual(pipeline[0], {
    $vectorSearch: {
      index: FAQ_VECTOR_INDEX_NAME,
      path: "embedding",
      queryVector,
      exact: true,
      limit: 3,
      filter: {
        active: true,
      },
    },
  });
  assert.ok(FAQ_MINIMUM_SCORE > 0 && FAQ_MINIMUM_SCORE < 1);
});

test("FAQ content hash is deterministic and content-sensitive", () => {
  assert.equal(
    createFaqContentHash("Question", "Answer"),
    createFaqContentHash(" Question ", " Answer "),
  );
  assert.notEqual(
    createFaqContentHash("Question", "Answer"),
    createFaqContentHash("Question", "Different answer"),
  );
});
