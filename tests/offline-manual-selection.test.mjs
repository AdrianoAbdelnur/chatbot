import assert from "node:assert/strict";
import test from "node:test";

import { expandManualSelection } from "../lib/offline-monitoring/manual-selection.ts";

const catalog = [
  { vehicleId: "CYBERMAPA:AB123CD", companyKey: "ACME", companyName: "ACME", plate: "AB123CD", present: true, identityStatus: "ok", enabled: false },
  { vehicleId: "CYBERMAPA:AC123CD", companyKey: "ACME", companyName: "ACME", plate: "AC123CD", present: true, identityStatus: "ok", enabled: true },
  { vehicleId: "CYBERMAPA:ZZ999ZZ", companyKey: "OTHER", companyName: "OTHER", plate: "ZZ999ZZ", present: false, identityStatus: "ok", enabled: false },
];

test("manual selection expands companies, vehicles, and overlap exactly once", () => {
  const selected = expandManualSelection({ companyKeys: ["ACME"], vehicles: [{ vehicleId: "CYBERMAPA:AB123CD", companyKey: "ACME" }] }, catalog);
  assert.deepEqual(selected.map(({ vehicleId }) => vehicleId), ["CYBERMAPA:AB123CD", "CYBERMAPA:AC123CD"]);
});

test("manual selection accepts disabled current vehicles but rejects stale, conflicted, and mismatched targets", () => {
  assert.equal(expandManualSelection({ companyKeys: [], vehicles: [{ vehicleId: "CYBERMAPA:AB123CD", companyKey: "ACME" }] }, catalog)[0].enabled, false);
  for (const vehicles of [
    [{ vehicleId: "CYBERMAPA:ZZ999ZZ", companyKey: "OTHER" }],
    [{ vehicleId: "CYBERMAPA:AB123CD", companyKey: "OTHER" }],
  ]) assert.throws(() => expandManualSelection({ companyKeys: [], vehicles }, catalog), /invalid manual target/);
});

test("manual selection rejects empty or unknown requests atomically", () => {
  assert.throws(() => expandManualSelection({ companyKeys: [], vehicles: [] }, catalog), /selection must not be empty/);
  assert.throws(() => expandManualSelection({ companyKeys: ["UNKNOWN"], vehicles: [] }, catalog), /invalid manual target/);
});
