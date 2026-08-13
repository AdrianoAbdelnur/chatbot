import assert from "node:assert/strict";
import test from "node:test";

import {
  clearManualSelection,
  createManualSelectionState,
  toggleManualCompany,
  toggleManualVehicle,
} from "../lib/offline-monitoring/manual-selection-state.ts";

test("manual selection state keeps automatic membership edits separate", () => {
  const state = createManualSelectionState();
  const selected = toggleManualVehicle(toggleManualCompany(state, "ACME"), "CYBERMAPA:AB123CD");
  assert.deepEqual(selected, { selectedCompanyKeys: ["ACME"], selectedVehicleIds: ["CYBERMAPA:AB123CD"] });
  assert.deepEqual(clearManualSelection(selected), { selectedCompanyKeys: [], selectedVehicleIds: [] });
});

test("manual selection toggles are reversible and request-local", () => {
  let state = createManualSelectionState();
  state = toggleManualCompany(state, "ACME");
  state = toggleManualVehicle(state, "CYBERMAPA:AB123CD");
  assert.deepEqual(toggleManualCompany(state, "ACME"), { selectedCompanyKeys: [], selectedVehicleIds: ["CYBERMAPA:AB123CD"] });
  assert.deepEqual(toggleManualVehicle(state, "CYBERMAPA:AB123CD"), { selectedCompanyKeys: ["ACME"], selectedVehicleIds: [] });
});
