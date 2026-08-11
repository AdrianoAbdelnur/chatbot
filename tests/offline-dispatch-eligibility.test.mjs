import assert from "node:assert/strict";
import test from "node:test";

import { buildDispatchEligibilityFilter } from "../lib/offline-monitoring/incident-store.ts";

const baseFilter = {
  active: true,
  initialNotificationId: { $exists: false },
  authorizedAt: { $type: "string" },
};

test("the dispatch eligibility filter requires explicit authorization by default", () => {
  const filter = buildDispatchEligibilityFilter();

  assert.deepEqual(filter, baseFilter);
  assert.equal("companyName" in filter, false);
});

test("the dispatch eligibility filter narrows authorized incidents to a company scope", () => {
  assert.deepEqual(buildDispatchEligibilityFilter({ companyName: "Acme" }), {
    ...baseFilter,
    companyName: "Acme",
  });
});

test("an empty dispatch scope behaves like the default scope", () => {
  assert.deepEqual(buildDispatchEligibilityFilter({}), baseFilter);
});