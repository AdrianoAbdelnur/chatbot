import assert from "node:assert/strict";
import test from "node:test";

import { createCatalogService } from "../lib/offline-monitoring/catalog-service.ts";

function vehicle(plate, companyName, gpsId = `gps-${plate}`) {
  return { system: "CYBERMAPA", plate, companyName, gpsId };
}

function createStore() {
  const records = new Map();
  return {
    records,
    async lookup(id) { return records.get(id) ?? null; },
    async upsertCatalogVehicle(input, identity) {
      const previous = records.get(identity.vehicleId);
      const record = { ...previous, ...identity, vehicleId: identity.vehicleId, present: true, enabled: previous?.enabled ?? false };
      records.set(record.vehicleId, record);
      return record;
    },
    async markUnseen(ids) {
      for (const [id, record] of records) if (!ids.includes(id)) records.set(id, { ...record, present: false });
    },
    async listCurrent() { return [...records.values()].filter((record) => record.present).sort((a, b) => a.companyName.localeCompare(b.companyName) || a.plate.localeCompare(b.plate)); },
  };
}

test("catalog synchronization groups all vehicles, defaults new memberships off, and marks unseen vehicles absent", async () => {
  const store = createStore();
  const service = createCatalogService({
    fetchVehicles: async () => [vehicle("ab 123 cd", "Beta"), vehicle("ac123cd", "Alpha")],
    store,
  });
  const first = await service.synchronize();
  assert.deepEqual(first.companies.map((company) => company.companyName), ["Alpha", "Beta"]);
  assert.equal(first.companies[0].vehicles[0].enabled, false);
  await service.synchronize();
  assert.equal(store.records.get("CYBERMAPA:AB123CD").present, true);
});

test("catalog synchronization preserves membership across company moves, conflicts fail closed, and ignores contacts", async () => {
  const store = createStore();
  const service = createCatalogService({
    fetchVehicles: async () => [vehicle("AB123CD", "First")],
    store,
  });
  await service.synchronize();
  store.records.get("CYBERMAPA:AB123CD").enabled = true;
  const moved = await service.synchronize([vehicle("AB123CD", "Second")]);
  assert.equal(moved.companies[0].vehicles[0].enabled, true);
  assert.equal(moved.companies[0].vehicles[0].companyName, "Second");
  const conflicted = await service.synchronize([vehicle("AB123CD", "Second", "different")]);
  assert.equal(conflicted.companies[0].vehicles[0].identityStatus, "identityConflict");
});
