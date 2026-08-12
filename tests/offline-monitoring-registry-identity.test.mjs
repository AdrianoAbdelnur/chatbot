import assert from "node:assert/strict";
import test from "node:test";

import {
  createRegistryVehicleId,
  evaluateRegistryIdentity,
  resolveCatalogIdentities,
} from "../lib/offline-monitoring/registry-identity.ts";

test("registry identity uses a normalized Cybermapa plate and preserves it across company moves", () => {
  assert.equal(createRegistryVehicleId(" ab-123 cd "), "CYBERMAPA:AB123CD");

  const result = evaluateRegistryIdentity({
    existing: {
      vehicleId: "CYBERMAPA:AB123CD",
      gpsId: "gps-1",
      companyKey: "OLD COMPANY",
    },
    incoming: {
      system: "CYBERMAPA",
      plate: "AB 123 CD",
      gpsId: "gps-1",
      companyName: "New Company",
    },
  });

  assert.equal(result.vehicleId, "CYBERMAPA:AB123CD");
  assert.equal(result.companyKey, "NEW COMPANY");
  assert.equal(result.identityStatus, "ok");
});

test("registry identity fails closed for duplicate plates and changed non-empty GPS identities", () => {
  const duplicates = resolveCatalogIdentities([
    { system: "CYBERMAPA", plate: "AB 123 CD", gpsId: "gps-1", companyName: "One" },
    { system: "CYBERMAPA", plate: "AB123CD", gpsId: "gps-2", companyName: "Two" },
  ]);

  assert.deepEqual(
    duplicates.map(({ vehicleId, identityStatus }) => ({ vehicleId, identityStatus })),
    [
      { vehicleId: "CYBERMAPA:AB123CD", identityStatus: "identityConflict" },
      { vehicleId: "CYBERMAPA:AB123CD", identityStatus: "identityConflict" },
    ],
  );

  const changedGps = evaluateRegistryIdentity({
    existing: { vehicleId: "CYBERMAPA:AB123CD", gpsId: "gps-1", companyKey: "ONE" },
    incoming: { system: "CYBERMAPA", plate: "AB123CD", gpsId: "gps-2", companyName: "One" },
  });
  assert.equal(changedGps.identityStatus, "identityConflict");
  assert.throws(() => createRegistryVehicleId("   "), /plate is required/);
});
