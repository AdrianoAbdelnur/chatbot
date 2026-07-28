import assert from "node:assert/strict";
import test from "node:test";

import { runOfflineNotificationDispatch } from "../lib/offline-monitoring/notification-service.ts";
import { OfflineTemplateRejectedError } from "../lib/offline-monitoring/whatsapp-template-client.ts";

process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";
process.env.WHATSAPP_API_VERSION = "v25.0";

const incident = {
  id: "000000000000000000000001",
  system: "CYBERMAPA",
  companyName: "Company One",
  plate: "AA123BB",
  lastReportedAt: "2026-07-20T12:30:00.000Z",
};

const contact = {
  id: "CYBERMAPA:COMPANY ONE",
  system: "CYBERMAPA",
  companyName: "Company One",
  companyKey: "COMPANY ONE",
  contactName: "Contact One",
  whatsappPhone: "5493810000001",
  enabled: true,
  vehicleSource: "manual",
  vehiclePlates: ["AA123BB"],
};

function createDependencies(sendError, capturedFailure) {
  return {
    listIncidents: async () => [incident],
    listContacts: async () => [contact],
    reserve: async () => "offline:test",
    sendTemplate: async () => {
      throw sendError;
    },
    markAccepted: async () => {
      throw new Error("failed sends must not be accepted");
    },
    markFailed: async (...args) => {
      capturedFailure.push(args);
    },
    trackOutgoing: async () => {
      throw new Error("failed sends must not be tracked");
    },
  };
}

test("explicit Meta rejections release the notification for a safe retry", async () => {
  const capturedFailure = [];
  const result = await runOfflineNotificationDispatch(
    { send: true },
    createDependencies(
      new OfflineTemplateRejectedError("Meta rejected the template."),
      capturedFailure,
    ),
  );

  assert.equal(result.failedCount, 1);
  assert.deepEqual(result.failures, [
    {
      companyName: "Company One",
      recipient: "*********0001",
      reason: "Meta rejected the template.",
    },
  ]);
  assert.deepEqual(capturedFailure, [
    [
      "offline:test",
      "Meta rejected the template.",
      { releaseForRetry: true },
    ],
  ]);
});

test("ambiguous transport failures remain reserved to prevent duplicates", async () => {
  const capturedFailure = [];
  const result = await runOfflineNotificationDispatch(
    { send: true },
    createDependencies(new Error("fetch failed"), capturedFailure),
  );

  assert.equal(result.failedCount, 1);
  assert.deepEqual(result.failures, [
    {
      companyName: "Company One",
      recipient: "*********0001",
      reason: "fetch failed",
    },
  ]);
  assert.deepEqual(capturedFailure, [
    ["offline:test", "fetch failed", { releaseForRetry: false }],
  ]);
});
