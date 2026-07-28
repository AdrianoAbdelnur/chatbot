import assert from "node:assert/strict";
import test from "node:test";

import { getOfflineThresholdHours } from "../lib/offline-monitoring/config.ts";

test("offline monitoring defaults to 48 hours", () => {
  assert.equal(getOfflineThresholdHours({}), 48);
});

test("offline monitoring accepts a configured integer threshold", () => {
  assert.equal(
    getOfflineThresholdHours({
      CYBERMAPA_OFFLINE_THRESHOLD_HOURS: "72",
    }),
    72,
  );
});

test("offline monitoring rejects invalid thresholds", () => {
  assert.throws(
    () =>
      getOfflineThresholdHours({
        CYBERMAPA_OFFLINE_THRESHOLD_HOURS: "0",
      }),
    /must be an integer between 1 and 8760/,
  );
  assert.throws(
    () =>
      getOfflineThresholdHours({
        CYBERMAPA_OFFLINE_THRESHOLD_HOURS: "48.5",
      }),
    /must be an integer between 1 and 8760/,
  );
});
