import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFLINE_OPERATIONAL_STATUSES,
  isOfflineOperationalStatus,
} from "../lib/offline-monitoring/operational-status.ts";

test("every value of the fixed vocabulary is accepted", () => {
  assert.deepEqual(OFFLINE_OPERATIONAL_STATUSES, [
    "workshop",
    "technical_review",
    "consulted_pending_answer",
    "reporting_again",
    "customer_debt",
  ]);

  for (const status of OFFLINE_OPERATIONAL_STATUSES) {
    assert.equal(isOfflineOperationalStatus(status), true);
  }
});

test("a value outside the fixed vocabulary is rejected", () => {
  assert.equal(isOfflineOperationalStatus("acknowledged"), false);
  assert.equal(isOfflineOperationalStatus("pending"), false);
  assert.equal(isOfflineOperationalStatus("red"), false);
});

test("the vocabulary is case sensitive and rejects empty input", () => {
  assert.equal(isOfflineOperationalStatus("Workshop"), false);
  assert.equal(isOfflineOperationalStatus("WORKSHOP"), false);
  assert.equal(isOfflineOperationalStatus(""), false);
  assert.equal(isOfflineOperationalStatus(" workshop "), false);
});

test("non-string input is rejected without throwing", () => {
  assert.equal(isOfflineOperationalStatus(null), false);
  assert.equal(isOfflineOperationalStatus(undefined), false);
  assert.equal(isOfflineOperationalStatus(42), false);
  assert.equal(isOfflineOperationalStatus({}), false);
});
