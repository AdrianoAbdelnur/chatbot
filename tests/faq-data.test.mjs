import assert from "node:assert/strict";
import test from "node:test";

import { FAQ_SOURCE_ENTRIES } from "../lib/faq/data.ts";

test("FAQ source contains 30 unique and complete entries", () => {
  assert.equal(FAQ_SOURCE_ENTRIES.length, 30);
  assert.equal(
    new Set(FAQ_SOURCE_ENTRIES.map((entry) => entry.id)).size,
    FAQ_SOURCE_ENTRIES.length,
  );

  for (const entry of FAQ_SOURCE_ENTRIES) {
    assert.ok(entry.id);
    assert.ok(entry.category);
    assert.ok(entry.question.endsWith("?"));
    assert.ok(entry.answer.length > 30);
    assert.doesNotMatch(
      `${entry.question}${entry.answer}`,
      /(?:Ã|Â|ï¿½)/,
    );
  }
});
