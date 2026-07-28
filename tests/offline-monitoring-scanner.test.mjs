import assert from "node:assert/strict";
import test from "node:test";

import { runCybermapaOfflineCheck } from "../lib/offline-monitoring/scanner.ts";

function createVehicle(companyName, plate) {
  return {
    companyName,
    make: "",
    model: "",
    color: "",
    year: "",
    plate,
    description: "",
    gpsId: "",
    moduleName: "",
    alias: "",
    name: "",
  };
}

const contact = {
  id: "CYBERMAPA:REGISTERED COMPANY",
  system: "CYBERMAPA",
  companyName: "Registered Company",
  companyKey: "REGISTERED COMPANY",
  contactName: "Fleet Contact",
  whatsappPhone: "5493810000000",
  enabled: true,
  vehicleSource: "platform",
  vehiclePlates: [],
};

test("only vehicles from registered companies are queried", async () => {
  let requestedPlates;
  let reconciledInput;

  const result = await runCybermapaOfflineCheck(
    {
      persist: true,
      now: new Date("2026-07-22T12:00:00.000Z"),
      thresholdHours: 48,
    },
    {
      listContacts: async () => [contact],
      getVehicles: async () => [
        createVehicle("Registered Company", "OLD001"),
        createVehicle("Registered Company", "NEW001"),
        createVehicle("Unregistered Company", "SKIP01"),
      ],
      getReports: async (plates) => {
        requestedPlates = plates;
        return [
          {
            plate: "OLD001",
            reportedAt: "19/07/2026 6:00:00",
          },
          {
            plate: "NEW001",
            reportedAt: "20/07/2026 9:00:00",
          },
        ];
      },
      reconcile: async (input) => {
        reconciledInput = input;
        return { created: 1, updated: 0, resolved: 1 };
      },
    },
  );

  assert.deepEqual(requestedPlates.sort(), ["NEW001", "OLD001"]);
  assert.equal(result.vehicleCount, 3);
  assert.equal(result.eligibleVehicleCount, 2);
  assert.equal(result.skippedWithoutContact, 1);
  assert.equal(result.delayedVehicleCount, 1);
  assert.equal(result.reportingVehicleCount, 1);
  assert.equal(reconciledInput.observations.length, 2);
  assert.equal(
    reconciledInput.observations.find(({ plate }) => plate === "OLD001")
      .isOffline,
    true,
  );
  assert.equal(
    reconciledInput.observations.find(({ plate }) => plate === "NEW001")
      .isOffline,
    false,
  );
});

test("exactly the configured threshold is not considered offline", async () => {
  const result = await runCybermapaOfflineCheck(
    {
      now: new Date("2026-07-22T12:00:00.000Z"),
      thresholdHours: 48,
    },
    {
      listContacts: async () => [contact],
      getVehicles: async () => [
        createVehicle("Registered Company", "ABC123"),
      ],
      getReports: async () => [
        {
          plate: "ABC123",
          reportedAt: "20/07/2026 9:00:00",
        },
      ],
      reconcile: async () => {
        throw new Error("dry-run must not persist");
      },
    },
  );

  assert.equal(result.delayedVehicleCount, 0);
  assert.equal(result.reportingVehicleCount, 1);
  assert.equal(result.reconciliation, null);
});

test("no Cybermapa request is made when no company is registered", async () => {
  const result = await runCybermapaOfflineCheck(
    { thresholdHours: 48 },
    {
      listContacts: async () => [],
      getVehicles: async () => {
        throw new Error("vehicles must not be requested");
      },
      getReports: async () => {
        throw new Error("reports must not be requested");
      },
      reconcile: async () => {
        throw new Error("incidents must not be reconciled");
      },
    },
  );

  assert.equal(result.contactCount, 0);
  assert.equal(result.vehicleCount, 0);
});

test("manual company plates bypass platform vehicle discovery", async () => {
  let requestedPlates;
  const result = await runCybermapaOfflineCheck(
    {
      now: new Date("2026-07-22T12:00:00.000Z"),
      thresholdHours: 48,
    },
    {
      listContacts: async () => [
        {
          ...contact,
          companyName: "CASCIA GASES",
          companyKey: "CASCIA GASES",
          vehicleSource: "manual",
          vehiclePlates: ["AH507ZH", "AH540HL"],
        },
      ],
      getVehicles: async () => {
        throw new Error("manual assignments must bypass GETVEHICULOS");
      },
      getReports: async (plates) => {
        requestedPlates = plates;
        return plates.map((plate) => ({
          plate,
          reportedAt: "20/07/2026 9:00:00",
        }));
      },
      reconcile: async () => {
        throw new Error("dry-run must not persist");
      },
    },
  );

  assert.deepEqual(requestedPlates.sort(), ["AH507ZH", "AH540HL"]);
  assert.equal(result.vehicleCount, 0);
  assert.equal(result.eligibleVehicleCount, 2);
});
