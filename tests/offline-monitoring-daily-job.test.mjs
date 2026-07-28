import assert from "node:assert/strict";
import test from "node:test";

import { runOfflineMonitoringDailyJob } from "../lib/offline-monitoring/daily-job.ts";

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
