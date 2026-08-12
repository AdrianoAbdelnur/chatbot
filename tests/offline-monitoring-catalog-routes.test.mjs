import assert from "node:assert/strict";
import test from "node:test";

import { createCatalogGetHandler } from "../app/api/offline-board/catalog/route.ts";
import { createMembershipPatchHandler } from "../app/api/offline-board/membership/route.ts";

const vehicle = { vehicleId: "CYBERMAPA:AB123CD", companyKey: "acme", companyName: "Acme", plate: "AB123CD", enabled: false, present: true, identityStatus: "ok" };

test("catalog GET synchronizes and returns only safe current catalog data without caching", async () => {
  let synchronized = 0;
  const response = await createCatalogGetHandler({ synchronize: async () => { synchronized += 1; return { companies: [{ companyKey: "acme", companyName: "Acme", vehicles: [vehicle] }] }; } })();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(synchronized, 1);
  assert.deepEqual(await response.json(), { success: true, companies: [{ companyKey: "acme", companyName: "Acme", vehicles: [vehicle] }] });
});

test("membership PATCH rejects malformed, unavailable, conflicted, and uninitialized updates", async () => {
  const handler = createMembershipPatchHandler({ hasMarker: async () => false, setMembership: async () => vehicle });
  assert.equal((await handler(new Request("https://test", { method: "PATCH", body: "{" }))).status, 400);
  const response = await handler(new Request("https://test", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ vehicleId: vehicle.vehicleId, enabled: true }) }));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { success: false, error: "Offline monitoring membership is not initialized." });
});

test("membership PATCH changes exactly one present conflict-free vehicle", async () => {
  const updates = [];
  const handler = createMembershipPatchHandler({ hasMarker: async () => true, setMembership: async (id, enabled) => { updates.push([id, enabled]); return { ...vehicle, enabled }; } });
  const response = await handler(new Request("https://test", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ vehicleId: vehicle.vehicleId, enabled: true }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(updates, [[vehicle.vehicleId, true]]);
  assert.deepEqual(await response.json(), { success: true, vehicle: { ...vehicle, enabled: true } });
});
