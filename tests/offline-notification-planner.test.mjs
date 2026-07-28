import assert from "node:assert/strict";
import test from "node:test";

import { createOfflineNotificationPreviews } from "../lib/offline-monitoring/notification-planner.ts";

function createContact(companyName, contactName, phone) {
  return {
    id: `CYBERMAPA:${companyName.toUpperCase()}`,
    system: "CYBERMAPA",
    companyName,
    companyKey: companyName.toUpperCase(),
    contactName,
    whatsappPhone: phone,
    enabled: true,
    vehicleSource: "manual",
    vehiclePlates: [],
  };
}

function createIncident(index, companyName) {
  return {
    id: index.toString(16).padStart(24, "0"),
    system: "CYBERMAPA",
    companyName,
    plate: `TEST${String(index).padStart(3, "0")}`,
    lastReportedAt: "2026-07-20T12:30:00.000Z",
  };
}

test("offline notifications are grouped by company in batches of ten", () => {
  const incidents = [
    ...Array.from({ length: 13 }, (_, index) =>
      createIncident(index + 1, "Company One"),
    ),
    createIncident(100, "Company Two"),
    createIncident(101, "Company Two"),
  ];
  const result = createOfflineNotificationPreviews(incidents, [
    createContact("Company One", "Contact One", "5493810000001"),
    createContact("Company Two", "Contact Two", "5493810000002"),
  ]);

  assert.equal(result.previews.length, 3);
  assert.deepEqual(
    result.previews.map((preview) => preview.vehicleCount),
    [10, 3, 2],
  );
  assert.equal(result.previews[0].incidentIds.length, 10);
  assert.match(result.previews[0].vehicleList, /TEST001/);
  assert.match(result.previews[0].vehicleList, /20\/07\/2026 09:30/);
  assert.equal(result.previews[0].maskedWhatsappPhone.endsWith("0001"), true);
  assert.equal(result.previews[0].maskedWhatsappPhone.includes("549381"), false);
});

test("incidents without an enabled company contact are skipped", () => {
  const result = createOfflineNotificationPreviews(
    [createIncident(1, "Unknown Company")],
    [],
  );

  assert.equal(result.previews.length, 0);
  assert.equal(result.skippedWithoutContact, 1);
});
