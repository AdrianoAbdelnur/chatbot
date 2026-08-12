import assert from "node:assert/strict";
import test from "node:test";

import { createPostHandler } from "../app/api/offline-board/checks/route.ts";

test("manual checks reject missing idempotency and malformed payload before dependencies", async () => {
  let called = false;
  const post = createPostHandler(async () => { called = true; throw new Error("must not run"); });
  const missing = await post(new Request("https://example.test/api/offline-board/checks", { method: "POST" }));
  assert.equal(missing.status, 400);
  const malformed = await post(new Request("https://example.test/api/offline-board/checks", { method: "POST", headers: { "Idempotency-Key": "k" }, body: "{}" }));
  assert.equal(malformed.status, 400);
  assert.equal(called, false);
});
