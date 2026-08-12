import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateExecutionSummary,
  createFailureOutcomes,
  normalizeRequestedVehicles,
  outcomeKinds,
} from "../lib/offline-monitoring/check-history-policy.ts";

const vehicles = [
  { vehicleId: "CYBERMAPA:AB123CD", companyKey: "ACME" },
  { vehicleId: "CYBERMAPA:AB123CD", companyKey: "ACME" },
  { vehicleId: "CYBERMAPA:AC123CD", companyKey: "ACME" },
];

test("history policy deduplicates requested vehicles and calculates a completed summary", () => {
  const requested = normalizeRequestedVehicles(vehicles);
  const summary = calculateExecutionSummary(requested, [
    { vehicleId: "CYBERMAPA:AB123CD", outcome: "reporting", observation: { plate: "AB123CD" } },
    { vehicleId: "CYBERMAPA:AC123CD", outcome: "delayed", observation: { plate: "AC123CD" } },
  ]);

  assert.deepEqual(requested.map((vehicle) => vehicle.vehicleId), [
    "CYBERMAPA:AB123CD",
    "CYBERMAPA:AC123CD",
  ]);
  assert.deepEqual(summary, {
    requestedCount: 2,
    outcomeCount: 2,
    counts: { reporting: 1, delayed: 1, missing: 0, invalid: 0, failure: 0 },
    status: "completed",
  });
});

test("history policy preserves partial and full failure truth without observations", () => {
  const requested = normalizeRequestedVehicles(vehicles);
  const partial = calculateExecutionSummary(requested, [
    { vehicleId: "CYBERMAPA:AB123CD", outcome: "reporting", observation: { plate: "AB123CD" } },
    { vehicleId: "CYBERMAPA:AC123CD", outcome: "failure" },
  ]);
  const failures = createFailureOutcomes(requested);
  const failed = calculateExecutionSummary(requested, failures);

  assert.equal(partial.status, "partial");
  assert.equal(failed.status, "failed");
  assert.ok(failures.every((outcome) => outcome.outcome === "failure" && !("observation" in outcome)));
});

test("history policy rejects unsupported outcome kinds and observations", () => {
  assert.deepEqual(outcomeKinds, ["reporting", "delayed", "missing", "invalid", "failure"]);
  assert.throws(
    () => calculateExecutionSummary([], [{ vehicleId: "x", outcome: "failure", observation: {} }]),
    /unsupported observation/,
  );
  assert.throws(
    () => calculateExecutionSummary([], [{ vehicleId: "x", outcome: "unknown" }]),
    /unsupported outcome/,
  );
});

test("history policy records an empty successful run and ignores repeated outcome writes", () => {
  const requested = normalizeRequestedVehicles([]);
  assert.deepEqual(calculateExecutionSummary(requested, []), {
    requestedCount: 0,
    outcomeCount: 0,
    counts: { reporting: 0, delayed: 0, missing: 0, invalid: 0, failure: 0 },
    status: "completed",
  });

  const one = { vehicleId: "CYBERMAPA:AB123CD", outcome: "missing" };
  assert.equal(
    calculateExecutionSummary([{ vehicleId: one.vehicleId, companyKey: "ACME" }], [one, one]).outcomeCount,
    1,
  );
});

test("history policy rejects outcomes outside the requested scope", () => {
  assert.throws(
    () => calculateExecutionSummary(
      [{ vehicleId: "CYBERMAPA:AB123CD", companyKey: "ACME" }],
      [{ vehicleId: "CYBERMAPA:AC123CD", outcome: "missing" }],
    ),
    /outside requested scope/,
  );
});
