import assert from "node:assert/strict";
import test from "node:test";

import { runOfflineCheck } from "../lib/offline-monitoring/check-service.ts";

const target = { vehicleId: "CYBERMAPA:AB123CD", companyKey: "ACME", plate: "AB123CD", companyName: "ACME" };

test("check service persists running before source work and reconciles supported observations", async () => {
  const calls = [];
  const result = await runOfflineCheck({ executionId: "manual:1", source: "manual", targets: [target], now: new Date("2026-01-02T15:00:00Z"), thresholdHours: 2 }, {
    history: {
      async startExecution(input) { calls.push(["start", input]); },
      async upsertOutcome(id, outcome) { calls.push(["outcome", id, outcome]); },
      async finalizeExecution(id) { calls.push(["finalize", id]); return { status: "completed" }; },
    },
    async getReports() { calls.push(["source"]); return [{ plate: "AB123CD", reportedAt: "02/01/2026 11:00:00" }]; },
    async reconcile(input) { calls.push(["reconcile", input]); return { created: 0, updated: 0, resolved: 1 }; },
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(calls.map(([name]) => name), ["start", "source", "outcome", "reconcile", "finalize"]);
});

test("check service writes failures for every target and never reconciles them", async () => {
  const calls = [];
  const result = await runOfflineCheck({ executionId: "cron:1", source: "cron", targets: [target], now: new Date(), thresholdHours: 2 }, {
    history: {
      async startExecution() { calls.push("start"); },
      async upsertOutcome(_, outcome) { calls.push(outcome); },
      async finalizeExecution() { calls.push("finalize"); return { status: "failed" }; },
    },
    async getReports() { throw new Error("provider unavailable"); },
    async reconcile() { calls.push("reconcile"); },
  });

  assert.equal(result.status, "failed");
  assert.equal(calls.filter((call) => call.outcome === "failure").length, 1);
  assert.ok(!calls.includes("reconcile"));
});

test("check service reconciles a delayed observation but not a missing outcome", async () => {
  const reconciled = [];
  const dependency = {
    history: {
      async startExecution() {},
      async upsertOutcome() {},
      async finalizeExecution() { return { status: "completed" }; },
    },
    async getReports() { return [{ plate: "AB123CD", reportedAt: "01/01/2026 10:00:00" }]; },
    async reconcile(input) { reconciled.push(input.observations); },
  };
  await runOfflineCheck({ executionId: "manual:2", source: "manual", targets: [target], now: new Date("2026-01-02T15:00:00Z"), thresholdHours: 2 }, dependency);
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0][0].isOffline, true);

  await runOfflineCheck({ executionId: "manual:3", source: "manual", targets: [target], now: new Date("2026-01-02T15:00:00Z"), thresholdHours: 2 }, { ...dependency, async getReports() { return []; } });
  assert.equal(reconciled.length, 1);
});
