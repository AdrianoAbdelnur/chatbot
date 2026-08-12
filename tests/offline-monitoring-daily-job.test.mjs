import assert from "node:assert/strict";
import test from "node:test";

import { runOfflineMonitoringDailyJob, runRegistryBackedDailyJob } from "../lib/offline-monitoring/daily-job.ts";

test("daily monitoring persists the scan before sending notifications", async () => {
  const calls = [];
  const result = await runOfflineMonitoringDailyJob({
    scan: async (options) => {
      calls.push(["scan", options]);
      return {
        persist: true,
        checkedAt: "2026-07-23T12:00:00.000Z",
        thresholdHours: 48,
        contactCount: 3,
        vehicleCount: 0,
        eligibleVehicleCount: 87,
        delayedVehicleCount: 15,
        reportingVehicleCount: 72,
        missingReportCount: 0,
        invalidReportCount: 0,
        skippedWithoutContact: 0,
        ambiguousPlateCount: 0,
        delayedVehicles: [],
        reconciliation: { created: 2, updated: 13, resolved: 1 },
      };
    },
    dispatch: async (options) => {
      calls.push(["dispatch", options]);
      return {
        send: true,
        template: {
          name: "vehicle_offline_followup",
          language: "es_AR",
        },
        unnotifiedIncidentCount: 15,
        notificationCount: 3,
        skippedWithoutContact: 0,
        acceptedCount: 3,
        failedCount: 0,
        skippedDuplicateCount: 0,
        failures: [],
        notifications: [],
      };
    },
  });

  assert.deepEqual(calls, [
    ["scan", { persist: true }],
    ["dispatch", { send: true }],
  ]);
  assert.deepEqual(result.reconciliation, {
    created: 2,
    updated: 13,
    resolved: 1,
  });
  assert.deepEqual(result.notifications, {
    planned: 3,
    accepted: 3,
    failed: 0,
    skippedDuplicates: 0,
    skippedWithoutContact: 0,
    failures: [],
  });
});

test("notifications are not dispatched when the scan fails", async () => {
  await assert.rejects(
    () =>
      runOfflineMonitoringDailyJob({
        scan: async () => {
          throw new Error("Cybermapa unavailable");
        },
        dispatch: async () => {
          throw new Error("dispatch must not run");
        },
      }),
    /Cybermapa unavailable/,
  );
});

test("registry cron refuses to run before migration and selects enabled conflict-free vehicles", async () => {
  const calls = [];
  await assert.rejects(
    () => runRegistryBackedDailyJob({ scheduledSlot: "2026-08-12T12:00Z" }, {
      synchronize: async () => { calls.push("sync"); },
      hasMigrationMarker: async () => false,
      listEnabled: async () => [],
      runCheck: async () => { throw new Error("must not run"); },
      dispatch: async () => { throw new Error("must not dispatch"); },
    }),
    /migration is not initialized/,
  );
  assert.deepEqual(calls, ["sync"]);
});

test("registry cron uses a stable slot identity and does not dispatch after total failure", async () => {
  const calls = [];
  const result = await runRegistryBackedDailyJob({ scheduledSlot: "2026-08-12T12:00Z" }, {
    synchronize: async () => calls.push("sync"),
    hasMigrationMarker: async () => true,
    listEnabled: async () => [
      { vehicleId: "CYBERMAPA:AB123CD", companyKey: "ACME", identityStatus: "ok", present: false },
      { vehicleId: "CYBERMAPA:AC123CD", companyKey: "ACME", identityStatus: "identityConflict", present: true },
    ],
    runCheck: async (input) => { calls.push(input); return { status: "failed", requestedCount: 1, outcomeCount: 1 }; },
    dispatch: async () => { throw new Error("must not dispatch"); },
  });

  assert.equal(result.executionId, "cron:2026-08-12T12:00Z");
  assert.equal(result.execution.status, "failed");
  assert.equal(calls[0], "sync");
  assert.equal(calls[1].targets[0].vehicleId, "CYBERMAPA:AB123CD");
});
