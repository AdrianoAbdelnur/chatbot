import assert from "node:assert/strict";
import test from "node:test";

import { authorizeOfflineIncidents } from "../lib/offline-monitoring/authorization-service.ts";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const OPERATOR = { id: "operator-01", name: "Ana Gómez" };

function createDependencies(overrides = {}) {
  const calls = [];
  const audited = [];
  const dispatched = [];

  return {
    calls,
    audited,
    dispatched,
    dependencies: {
      findOperator: async (operatorId) =>
        operatorId === OPERATOR.id ? OPERATOR : null,
      markAuthorized: async (input) => {
        calls.push("markAuthorized");

        return input.incidentIds.map((incidentId) => ({
          id: incidentId,
          companyName: "Company One",
        }));
      },
      appendAudit: async (event) => {
        calls.push("appendAudit");
        audited.push(event);
      },
      dispatch: async (options) => {
        calls.push("dispatch");
        dispatched.push(options);

        return {
          notificationCount: 1,
          acceptedCount: 1,
          failedCount: 0,
          skippedDuplicateCount: 0,
        };
      },
      now: () => NOW,
      ...overrides,
    },
  };
}

test("an unknown operator is rejected without stamping, auditing or dispatching", async () => {
  const { calls, dependencies } = createDependencies();
  const result = await authorizeOfflineIncidents(
    { operatorId: "ghost-operator", incidentIds: ["incident-1"] },
    dependencies,
  );

  assert.deepEqual(result, { status: "rejected", reason: "unknown_operator" });
  assert.deepEqual(calls, []);
});

test("an empty incident selection is rejected without any write", async () => {
  const { calls, dependencies } = createDependencies();
  const result = await authorizeOfflineIncidents(
    { operatorId: OPERATOR.id, incidentIds: [] },
    dependencies,
  );

  assert.deepEqual(result, { status: "rejected", reason: "no_incidents" });
  assert.deepEqual(calls, []);
});

test("authorization stamps, then audits, then dispatches, in that order", async () => {
  const { calls, audited, dispatched, dependencies } = createDependencies();
  const result = await authorizeOfflineIncidents(
    { operatorId: OPERATOR.id, incidentIds: ["incident-1"] },
    dependencies,
  );

  assert.deepEqual(calls, ["markAuthorized", "appendAudit", "dispatch"]);
  assert.deepEqual(audited, [
    {
      incidentId: "incident-1",
      action: "authorization",
      actor: OPERATOR,
      after: NOW.toISOString(),
    },
  ]);
  assert.deepEqual(dispatched, [
    { send: true, scope: { companyName: "Company One" } },
  ]);
  assert.deepEqual(result, {
    status: "authorized",
    dispatches: [
      {
        companyName: "Company One",
        notificationCount: 1,
        acceptedCount: 1,
        failedCount: 0,
        skippedDuplicateCount: 0,
      },
    ],
  });
});

test("the authorization timestamp is the one written to the incidents", async () => {
  const stamped = [];
  const { dependencies } = createDependencies({
    markAuthorized: async (input) => {
      stamped.push(input);

      return input.incidentIds.map((incidentId) => ({
        id: incidentId,
        companyName: "Company One",
      }));
    },
  });

  await authorizeOfflineIncidents(
    { operatorId: OPERATOR.id, incidentIds: ["incident-1"] },
    dependencies,
  );

  assert.deepEqual(stamped, [
    {
      incidentIds: ["incident-1"],
      actor: OPERATOR,
      authorizedAt: NOW.toISOString(),
    },
  ]);
});

test("incidents spanning two companies produce one scoped dispatch each", async () => {
  const { audited, dispatched, dependencies } = createDependencies({
    markAuthorized: async () => [
      { id: "incident-1", companyName: "Company One" },
      { id: "incident-2", companyName: "Company Two" },
      { id: "incident-3", companyName: "Company One" },
    ],
  });

  const result = await authorizeOfflineIncidents(
    {
      operatorId: OPERATOR.id,
      incidentIds: ["incident-1", "incident-2", "incident-3"],
    },
    dependencies,
  );

  assert.equal(audited.length, 3);
  assert.deepEqual(dispatched, [
    { send: true, scope: { companyName: "Company One" } },
    { send: true, scope: { companyName: "Company Two" } },
  ]);
  assert.equal(result.dispatches.length, 2);
  assert.deepEqual(
    result.dispatches.map((dispatch) => dispatch.companyName),
    ["Company One", "Company Two"],
  );
});

test("an already-sent incident is still stamped and audited without a second reservation", async () => {
  const { audited, dispatched, dependencies } = createDependencies({
    markAuthorized: async () => [
      {
        id: "incident-1",
        companyName: "Company One",
        initialNotificationId: "offline:already-sent",
      },
    ],
  });

  const result = await authorizeOfflineIncidents(
    { operatorId: OPERATOR.id, incidentIds: ["incident-1"] },
    dependencies,
  );

  assert.equal(result.status, "authorized");
  assert.equal(audited.length, 1);
  // The dispatch runs, but the eligibility gate excludes an incident that
  // already carries initialNotificationId, so no duplicate message is sent.
  assert.deepEqual(dispatched, [
    { send: true, scope: { companyName: "Company One" } },
  ]);
});

test("re-authorizing an incident succeeds without duplicating the dispatch", async () => {
  const { dispatched, dependencies } = createDependencies();

  await authorizeOfflineIncidents(
    { operatorId: OPERATOR.id, incidentIds: ["incident-1"] },
    dependencies,
  );
  const result = await authorizeOfflineIncidents(
    { operatorId: OPERATOR.id, incidentIds: ["incident-1"] },
    dependencies,
  );

  assert.equal(result.status, "authorized");
  assert.equal(dispatched.length, 2);
  assert.deepEqual(dispatched[1], {
    send: true,
    scope: { companyName: "Company One" },
  });
});

test("duplicate incident ids are collapsed before stamping", async () => {
  const stamped = [];
  const { dependencies } = createDependencies({
    markAuthorized: async (input) => {
      stamped.push(input.incidentIds);

      return input.incidentIds.map((incidentId) => ({
        id: incidentId,
        companyName: "Company One",
      }));
    },
  });

  await authorizeOfflineIncidents(
    {
      operatorId: OPERATOR.id,
      incidentIds: ["incident-1", "incident-1", "incident-2"],
    },
    dependencies,
  );

  assert.deepEqual(stamped, [["incident-1", "incident-2"]]);
});
