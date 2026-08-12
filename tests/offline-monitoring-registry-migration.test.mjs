import assert from "node:assert/strict";
import test from "node:test";

import { createLegacy87Migration } from "../lib/offline-monitoring/registry-migration.ts";

const vehicles = Array.from({ length: 87 }, (_, index) => ({
  system: "CYBERMAPA",
  plate: `AB${String(index).padStart(3, "0")}CD`,
  gpsId: `gps-${index}`,
  companyName: "Legacy Company",
}));

function createHarness(overrides = {}) {
  const records = new Map();
  let marker = false;
  return {
    records,
    migration: createLegacy87Migration({
      listLegacyPlates: async () => vehicles.map((vehicle) => vehicle.plate),
      resolveCatalog: async () => vehicles,
      hasMarker: async () => marker,
      createMarker: async () => { marker = true; return true; },
      initializeMembership: async (vehicle) => {
        const id = `CYBERMAPA:${vehicle.plate}`;
        records.set(id, { ...vehicle, enabled: true });
      },
      ...overrides,
    }),
  };
}

test("legacy migration enables exactly 87 normalized catalog vehicles and is repeatable", async () => {
  const { migration, records } = createHarness();
  assert.deepEqual(await migration.run({ dryRun: true }), { status: "ready", count: 87 });
  assert.deepEqual(await migration.run(), { status: "initialized", count: 87 });
  assert.equal(records.size, 87);
  assert.deepEqual(await migration.run(), { status: "already_initialized", count: 87 });
});

test("legacy migration fails closed without a marker on invalid count or catalog resolution", async () => {
  const countHarness = createHarness({ listLegacyPlates: async () => ["AB001CD"] });
  assert.deepEqual(await countHarness.migration.run(), { status: "invalid", reason: "legacy_plate_count" });

  const unresolvedHarness = createHarness({ resolveCatalog: async () => vehicles.slice(1) });
  assert.deepEqual(await unresolvedHarness.migration.run(), { status: "invalid", reason: "unresolved_catalog_identity" });
});

test("legacy migration rejects duplicate catalog identities and preserves post-marker choices", async () => {
  const duplicateHarness = createHarness({ resolveCatalog: async () => [...vehicles, { ...vehicles[0], gpsId: "other" }] });
  assert.deepEqual(await duplicateHarness.migration.run(), { status: "invalid", reason: "duplicate_catalog_identity" });

  const { migration, records } = createHarness();
  await migration.run();
  records.get("CYBERMAPA:AB000CD").enabled = false;
  await migration.run();
  assert.equal(records.get("CYBERMAPA:AB000CD").enabled, false);
});
