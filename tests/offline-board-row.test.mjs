import assert from "node:assert/strict";
import test from "node:test";

import { toBoardRow } from "../lib/offline-monitoring/board-row.ts";

const NOW = new Date("2026-08-04T12:00:00.000Z");

function createIncident(overrides = {}) {
  return {
    id: "000000000000000000000001",
    system: "CYBERMAPA",
    companyName: "Company One",
    plate: "AA123BB",
    lastReportedAt: "2026-08-03T12:00:00.000Z",
    ...overrides,
  };
}

test("an incident without authorization reports the not authorized state", () => {
  const row = toBoardRow(createIncident(), null, NOW);

  assert.equal(row.whatsappQueryState, "not_authorized");
});

test("an authorized incident without a reservation reports authorized but not sent", () => {
  const row = toBoardRow(
    createIncident({ authorizedAt: "2026-08-04T11:00:00.000Z" }),
    null,
    NOW,
  );

  assert.equal(row.whatsappQueryState, "authorized_not_sent");
});

test("a reserved notification still pending reports the dispatching state", () => {
  const row = toBoardRow(
    createIncident({
      authorizedAt: "2026-08-04T11:00:00.000Z",
      initialNotificationId: "offline:abc",
    }),
    { status: "pending" },
    NOW,
  );

  assert.equal(row.whatsappQueryState, "dispatching");
});

test("a notification accepted by Meta reports sent and never delivered", () => {
  const row = toBoardRow(
    createIncident({
      authorizedAt: "2026-08-04T11:00:00.000Z",
      initialNotificationId: "offline:abc",
    }),
    { status: "accepted" },
    NOW,
  );

  assert.equal(row.whatsappQueryState, "sent");
  assert.notEqual(row.whatsappQueryState, "delivered");
});

test("failed and cancelled notifications both report the failed state", () => {
  const incident = createIncident({
    authorizedAt: "2026-08-04T11:00:00.000Z",
    initialNotificationId: "offline:abc",
  });

  assert.equal(
    toBoardRow(incident, { status: "failed", failureReason: "Meta rejected." }, NOW)
      .whatsappQueryState,
    "failed",
  );
  assert.equal(
    toBoardRow(incident, { status: "cancelled" }, NOW).whatsappQueryState,
    "failed",
  );
});

test("the failure reason is exposed only for a failed notification", () => {
  const incident = createIncident({
    authorizedAt: "2026-08-04T11:00:00.000Z",
    initialNotificationId: "offline:abc",
  });

  assert.equal(
    toBoardRow(incident, { status: "failed", failureReason: "Meta rejected." }, NOW)
      .whatsappFailureReason,
    "Meta rejected.",
  );
  assert.equal(
    toBoardRow(incident, { status: "accepted" }, NOW).whatsappFailureReason,
    null,
  );
  assert.equal(toBoardRow(incident, null, NOW).whatsappFailureReason, null);
});

test("a reserved incident whose notification is missing never claims to be sent", () => {
  const row = toBoardRow(
    createIncident({
      authorizedAt: "2026-08-04T11:00:00.000Z",
      initialNotificationId: "offline:abc",
    }),
    null,
    NOW,
  );

  assert.equal(row.whatsappQueryState, "dispatching");
});

test("an incident notified before the authorization gate reports its real send state", () => {
  // These incidents predate the authorization field, so they carry a
  // reservation but no authorizedAt. Reporting them as "not authorized" would
  // invite an operator to authorize a row that can never dispatch again.
  const legacyIncident = createIncident({
    initialNotificationId: "offline:abc",
  });

  assert.equal(
    toBoardRow(legacyIncident, { status: "accepted" }, NOW)
      .whatsappQueryState,
    "sent",
  );
  assert.equal(
    toBoardRow(legacyIncident, { status: "pending" }, NOW).whatsappQueryState,
    "dispatching",
  );
  assert.equal(
    toBoardRow(legacyIncident, { status: "failed" }, NOW).whatsappQueryState,
    "failed",
  );
});

test("a reservation released after a Meta rejection falls back to its authorization state", () => {
  // markOfflineNotificationFailed unsets initialNotificationId when it releases
  // for retry, so the row must return to a dispatchable state.
  assert.equal(
    toBoardRow(
      createIncident({ authorizedAt: "2026-08-04T11:00:00.000Z" }),
      { status: "failed" },
      NOW,
    ).whatsappQueryState,
    "authorized_not_sent",
  );
  assert.equal(
    toBoardRow(createIncident(), { status: "failed" }, NOW)
      .whatsappQueryState,
    "not_authorized",
  );
});

test("a customer reply is exposed on every incident in its notification batch", () => {
  const row = toBoardRow(
    createIncident({ initialNotificationId: "offline:abc" }),
    {
      status: "accepted",
      customerReply: {
        text: "La unidad ya esta reportando.",
        receivedAt: "2026-08-04T11:30:00.000Z",
      },
    },
    NOW,
  );

  assert.deepEqual(row.whatsappCustomerReply, {
    text: "La unidad ya esta reportando.",
    receivedAt: "2026-08-04T11:30:00.000Z",
  });
});

test("the derived age is measured in hours from the last report", () => {
  assert.equal(toBoardRow(createIncident(), null, NOW).offlineHours, 24);
  assert.equal(
    toBoardRow(
      createIncident({ lastReportedAt: "2026-08-04T09:30:00.000Z" }),
      null,
      NOW,
    ).offlineHours,
    2.5,
  );
});

test("an unreviewed incident exposes empty operator fields, never inferred", () => {
  const row = toBoardRow(createIncident({ status: "pending" }), null, NOW);

  assert.equal(row.operationalStatus, null);
  assert.equal(row.operatorComment, null);
  assert.equal(row.reviewedAt, null);
  assert.equal(row.reviewedBy, null);
});

test("a reviewed and authorized incident exposes the full row contract", () => {
  const row = toBoardRow(
    createIncident({
      authorizedAt: "2026-08-04T11:00:00.000Z",
      initialNotificationId: "offline:abc",
      operationalStatus: "workshop",
      operatorComment: "Unit is at the workshop.",
      reviewedAt: "2026-08-04T10:00:00.000Z",
      reviewedBy: { id: "operator-1", name: "Operator One" },
    }),
    { status: "accepted" },
    NOW,
  );

  assert.deepEqual(row, {
    id: "000000000000000000000001",
    system: "CYBERMAPA",
    companyName: "Company One",
    plate: "AA123BB",
    lastReportedAt: "2026-08-03T12:00:00.000Z",
    offlineHours: 24,
    operationalStatus: "workshop",
    operatorComment: "Unit is at the workshop.",
    reviewedAt: "2026-08-04T10:00:00.000Z",
    reviewedBy: { id: "operator-1", name: "Operator One" },
    authorizedAt: "2026-08-04T11:00:00.000Z",
    whatsappQueryState: "sent",
    whatsappFailureReason: null,
    whatsappCustomerReply: null,
  });
});
