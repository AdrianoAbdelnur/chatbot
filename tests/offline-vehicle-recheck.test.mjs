import assert from "node:assert/strict";
import test from "node:test";

import { recheckOfflineVehicle } from "../lib/offline-monitoring/recheck-service.ts";

// Argentina is UTC-3, so a Cybermapa local timestamp of 06:00 is 09:00 UTC.
const NOW = new Date("2026-08-05T12:00:00.000Z");
const THRESHOLD_HOURS = 24;
const OPERATOR = { id: "operator-01", name: "Ana Gómez" };
const INCIDENT = {
  id: "000000000000000000000001",
  system: "CYBERMAPA",
  companyName: "Company One",
  plate: "AA123BB",
  lastReportedAt: "2026-08-01T09:00:00.000Z",
};

function createDependencies(overrides = {}) {
  const requestedPlates = [];
  const reconciled = [];
  const audited = [];

  return {
    requestedPlates,
    reconciled,
    audited,
    dependencies: {
      findOperator: async (operatorId) =>
        operatorId === OPERATOR.id ? OPERATOR : null,
      findIncident: async (incidentId) =>
        incidentId === INCIDENT.id ? INCIDENT : null,
      getReports: async (plates) => {
        requestedPlates.push(plates);

        return [{ plate: "AA123BB", reportedAt: "03/08/2026 06:00:00" }];
      },
      reconcile: async (input) => {
        reconciled.push(input);

        return { created: 0, updated: 1, resolved: 0 };
      },
      appendAudit: async (event) => {
        audited.push(event);
      },
      now: () => NOW,
      thresholdHours: () => THRESHOLD_HOURS,
      ...overrides,
    },
  };
}

test("an unknown operator is rejected before any upstream call or audit", async () => {
  const { requestedPlates, reconciled, audited, dependencies } =
    createDependencies();
  const result = await recheckOfflineVehicle(
    { operatorId: "ghost-operator", incidentId: INCIDENT.id },
    dependencies,
  );

  assert.deepEqual(result, { status: "rejected", reason: "unknown_operator" });
  assert.deepEqual(requestedPlates, []);
  assert.deepEqual(reconciled, []);
  assert.deepEqual(audited, []);
});

test("an unknown or resolved incident is rejected before any upstream call", async () => {
  const { requestedPlates, reconciled, audited, dependencies } =
    createDependencies();
  const result = await recheckOfflineVehicle(
    { operatorId: OPERATOR.id, incidentId: "999999999999999999999999" },
    dependencies,
  );

  assert.deepEqual(result, { status: "rejected", reason: "unknown_incident" });
  assert.deepEqual(requestedPlates, []);
  assert.deepEqual(reconciled, []);
  assert.deepEqual(audited, []);
});

test("exactly one plate is requested from the upstream platform", async () => {
  const { requestedPlates, dependencies } = createDependencies();

  await recheckOfflineVehicle(
    { operatorId: OPERATOR.id, incidentId: INCIDENT.id },
    dependencies,
  );

  assert.deepEqual(requestedPlates, [["AA123BB"]]);
});

test("an upstream failure is audited and never reconciles the incident", async () => {
  const { reconciled, audited, dependencies } = createDependencies({
    getReports: async () => {
      throw new Error("Cybermapa is unreachable.");
    },
  });

  const result = await recheckOfflineVehicle(
    { operatorId: OPERATOR.id, incidentId: INCIDENT.id },
    dependencies,
  );

  assert.deepEqual(result, {
    status: "upstream_failure",
    reason: "Cybermapa is unreachable.",
  });
  assert.deepEqual(reconciled, []);
  assert.deepEqual(audited, [
    {
      incidentId: INCIDENT.id,
      action: "recheck",
      actor: OPERATOR,
      outcome: "upstream_failure",
    },
  ]);
});

test("a vehicle reporting within the threshold reconciles as no longer offline", async () => {
  const { reconciled, audited, dependencies } = createDependencies({
    getReports: async () => [
      { plate: "AA123BB", reportedAt: "05/08/2026 06:00:00" },
    ],
  });

  const result = await recheckOfflineVehicle(
    { operatorId: OPERATOR.id, incidentId: INCIDENT.id },
    dependencies,
  );

  assert.deepEqual(result, { status: "applied" });
  assert.deepEqual(reconciled, [
    {
      observations: [
        {
          system: "CYBERMAPA",
          companyName: "Company One",
          plate: "AA123BB",
          lastReportedAt: "2026-08-05T09:00:00.000Z",
          offlineHours: 3,
          isOffline: false,
        },
      ],
      thresholdHours: THRESHOLD_HOURS,
      checkedAt: NOW.toISOString(),
    },
  ]);
  assert.deepEqual(audited, [
    {
      incidentId: INCIDENT.id,
      action: "recheck",
      actor: OPERATOR,
      before: INCIDENT.lastReportedAt,
      after: "2026-08-05T09:00:00.000Z",
      outcome: "applied",
    },
  ]);
});

test("a vehicle still beyond the threshold refreshes its last report and stays offline", async () => {
  const { reconciled, audited, dependencies } = createDependencies();

  const result = await recheckOfflineVehicle(
    { operatorId: OPERATOR.id, incidentId: INCIDENT.id },
    dependencies,
  );

  assert.deepEqual(result, { status: "applied" });
  assert.equal(reconciled[0].observations[0].lastReportedAt, "2026-08-03T09:00:00.000Z");
  assert.equal(reconciled[0].observations[0].offlineHours, 51);
  assert.equal(reconciled[0].observations[0].isOffline, true);
  assert.equal(audited[0].after, "2026-08-03T09:00:00.000Z");
});

test("the company name comes from the stored incident, never from upstream", async () => {
  const { reconciled, dependencies } = createDependencies({
    getReports: async () => [
      {
        plate: "AA123BB",
        reportedAt: "03/08/2026 06:00:00",
        companyName: "Wrong Company",
      },
    ],
  });

  await recheckOfflineVehicle(
    { operatorId: OPERATOR.id, incidentId: INCIDENT.id },
    dependencies,
  );

  assert.equal(reconciled[0].observations[0].companyName, "Company One");
});

test("a missing report for the plate is audited as no change and never reconciled", async () => {
  const { reconciled, audited, dependencies } = createDependencies({
    getReports: async () => [],
  });

  const result = await recheckOfflineVehicle(
    { operatorId: OPERATOR.id, incidentId: INCIDENT.id },
    dependencies,
  );

  assert.deepEqual(result, { status: "no_change" });
  assert.deepEqual(reconciled, []);
  assert.deepEqual(audited, [
    {
      incidentId: INCIDENT.id,
      action: "recheck",
      actor: OPERATOR,
      outcome: "no_change",
    },
  ]);
});

test("an unparseable report is audited as no change and never reconciled", async () => {
  const { reconciled, audited, dependencies } = createDependencies({
    getReports: async () => [{ plate: "AA123BB", reportedAt: "not a date" }],
  });

  const result = await recheckOfflineVehicle(
    { operatorId: OPERATOR.id, incidentId: INCIDENT.id },
    dependencies,
  );

  assert.deepEqual(result, { status: "no_change" });
  assert.deepEqual(reconciled, []);
  assert.equal(audited[0].outcome, "no_change");
});

test("a report dated in the future is rejected as unusable", async () => {
  const { reconciled, dependencies } = createDependencies({
    getReports: async () => [
      { plate: "AA123BB", reportedAt: "06/08/2026 06:00:00" },
    ],
  });

  const result = await recheckOfflineVehicle(
    { operatorId: OPERATOR.id, incidentId: INCIDENT.id },
    dependencies,
  );

  assert.deepEqual(result, { status: "no_change" });
  assert.deepEqual(reconciled, []);
});
