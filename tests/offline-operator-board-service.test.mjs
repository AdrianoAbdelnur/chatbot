import assert from "node:assert/strict";
import test from "node:test";

import { submitOperatorReview } from "../lib/offline-monitoring/operator-board-service.ts";

const NOW = new Date("2026-08-04T12:00:00.000Z");
const OPERATOR = { id: "operator-01", name: "Ana Gómez" };
const INCIDENT_ID = "000000000000000000000001";

function createDependencies(overrides = {}) {
  const applied = [];
  const audited = [];

  return {
    applied,
    audited,
    dependencies: {
      findOperator: async (operatorId) =>
        operatorId === OPERATOR.id ? OPERATOR : null,
      applyReview: async (input) => {
        applied.push(input);

        return { previousOperationalStatus: "workshop" };
      },
      appendAudit: async (event) => {
        audited.push(event);
      },
      now: () => NOW,
      ...overrides,
    },
  };
}

test("a valid review persists status, comment, operator and timestamp together", async () => {
  const { applied, dependencies } = createDependencies();
  const result = await submitOperatorReview(
    {
      operatorId: OPERATOR.id,
      incidentId: INCIDENT_ID,
      operationalStatus: "technical_review",
      comment: "  Waiting for the workshop answer.  ",
    },
    dependencies,
  );

  assert.deepEqual(result, { status: "applied" });
  assert.equal(applied.length, 1);
  assert.deepEqual(applied[0], {
    incidentId: INCIDENT_ID,
    operationalStatus: "technical_review",
    comment: "Waiting for the workshop answer.",
    actor: OPERATOR,
    reviewedAt: NOW.toISOString(),
  });
});

test("the applied review never carries the scanner-owned fields", async () => {
  const { applied, dependencies } = createDependencies();

  await submitOperatorReview(
    {
      operatorId: OPERATOR.id,
      incidentId: INCIDENT_ID,
      operationalStatus: "workshop",
    },
    dependencies,
  );

  assert.equal("status" in applied[0], false);
  assert.equal("active" in applied[0], false);
  assert.equal(applied[0].comment, null);
});

test("an unknown operator is rejected without any write", async () => {
  const { applied, audited, dependencies } = createDependencies();
  const result = await submitOperatorReview(
    {
      operatorId: "ghost-operator",
      incidentId: INCIDENT_ID,
      operationalStatus: "workshop",
    },
    dependencies,
  );

  assert.deepEqual(result, { status: "rejected", reason: "unknown_operator" });
  assert.deepEqual(applied, []);
  assert.deepEqual(audited, []);
});

test("a status outside the fixed vocabulary is rejected without any write", async () => {
  const { applied, audited, dependencies } = createDependencies();
  const result = await submitOperatorReview(
    {
      operatorId: OPERATOR.id,
      incidentId: INCIDENT_ID,
      operationalStatus: "acknowledged",
    },
    dependencies,
  );

  assert.deepEqual(result, { status: "rejected", reason: "invalid_status" });
  assert.deepEqual(applied, []);
  assert.deepEqual(audited, []);
});

test("a comment longer than the limit is rejected, never truncated", async () => {
  const { applied, audited, dependencies } = createDependencies();
  const result = await submitOperatorReview(
    {
      operatorId: OPERATOR.id,
      incidentId: INCIDENT_ID,
      operationalStatus: "workshop",
      comment: "x".repeat(1001),
    },
    dependencies,
  );

  assert.deepEqual(result, { status: "rejected", reason: "comment_too_long" });
  assert.deepEqual(applied, []);
  assert.deepEqual(audited, []);
});

test("the comment limit is measured after trimming", async () => {
  const { applied, dependencies } = createDependencies();
  const result = await submitOperatorReview(
    {
      operatorId: OPERATOR.id,
      incidentId: INCIDENT_ID,
      operationalStatus: "workshop",
      comment: `   ${"x".repeat(1000)}   `,
    },
    dependencies,
  );

  assert.deepEqual(result, { status: "applied" });
  assert.equal(applied[0].comment.length, 1000);
});

test("an unknown or resolved incident is rejected and never audited", async () => {
  const { audited, dependencies } = createDependencies({
    applyReview: async () => null,
  });
  const result = await submitOperatorReview(
    {
      operatorId: OPERATOR.id,
      incidentId: INCIDENT_ID,
      operationalStatus: "workshop",
    },
    dependencies,
  );

  assert.deepEqual(result, { status: "rejected", reason: "unknown_incident" });
  assert.deepEqual(audited, []);
});

test("a successful review appends exactly one audit event with before and after", async () => {
  const { audited, dependencies } = createDependencies();

  await submitOperatorReview(
    {
      operatorId: OPERATOR.id,
      incidentId: INCIDENT_ID,
      operationalStatus: "technical_review",
    },
    dependencies,
  );

  assert.equal(audited.length, 1);
  assert.deepEqual(audited[0], {
    incidentId: INCIDENT_ID,
    action: "status_change",
    actor: OPERATOR,
    before: "workshop",
    after: "technical_review",
  });
});

test("a first review records a null before value", async () => {
  const { audited, dependencies } = createDependencies({
    applyReview: async () => ({ previousOperationalStatus: null }),
  });

  await submitOperatorReview(
    {
      operatorId: OPERATOR.id,
      incidentId: INCIDENT_ID,
      operationalStatus: "workshop",
    },
    dependencies,
  );

  assert.equal(audited[0].before, null);
  assert.equal(audited[0].after, "workshop");
});
