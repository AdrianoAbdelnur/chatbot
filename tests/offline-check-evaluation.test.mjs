import assert from "node:assert/strict";
import test from "node:test";

import { evaluateOfflineCheckBatch } from "../lib/offline-monitoring/check-evaluation.ts";

const NOW = new Date("2026-01-02T21:00:00.000Z");
const targets = [
  { vehicleId: "CYBERMAPA:AB123CD", companyKey: "ACME", plate: "AB123CD", companyName: "ACME" },
  { vehicleId: "CYBERMAPA:AC123CD", companyKey: "ACME", plate: "AC123CD", companyName: "ACME" },
];

test("evaluation selects the latest valid report and applies the delay threshold", () => {
  const outcomes = evaluateOfflineCheckBatch({
    targets,
    reports: [
      { plate: "AB123CD", reportedAt: "02/01/2026 11:00:00" },
      { plate: "AB123CD", reportedAt: "02/01/2026 13:30:00" },
      { plate: "AC123CD", reportedAt: "02/01/2026 18:00:00" },
    ],
    now: NOW,
    thresholdHours: 2,
  });

  assert.deepEqual(outcomes.map(({ vehicleId, outcome }) => ({ vehicleId, outcome })), [
    { vehicleId: "CYBERMAPA:AB123CD", outcome: "delayed" },
    { vehicleId: "CYBERMAPA:AC123CD", outcome: "reporting" },
  ]);
  assert.equal(outcomes[0].observation.offlineHours, 4.5);
});

test("evaluation distinguishes missing, invalid, and per-batch failure outcomes", () => {
  const invalid = evaluateOfflineCheckBatch({
    targets,
    reports: [{ plate: "AB123CD", reportedAt: "02/01/2027 14:00:00" }],
    now: NOW,
    thresholdHours: 2,
  });
  const failed = evaluateOfflineCheckBatch({ targets, reports: [], now: NOW, thresholdHours: 2, error: "provider unavailable" });

  assert.deepEqual(invalid.map(({ outcome }) => outcome), ["invalid", "missing"]);
  assert.deepEqual(failed.map(({ outcome, error }) => ({ outcome, error })), [
    { outcome: "failure", error: "provider unavailable" },
    { outcome: "failure", error: "provider unavailable" },
  ]);
});

test("evaluation emits one outcome for each distinct target", () => {
  const outcomes = evaluateOfflineCheckBatch({ targets: [targets[0], targets[0]], reports: [], now: NOW, thresholdHours: 2 });
  assert.equal(outcomes.length, 1);
});
