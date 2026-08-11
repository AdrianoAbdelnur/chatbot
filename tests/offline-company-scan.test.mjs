import assert from "node:assert/strict";
import test from "node:test";

import {
  listMonitoringCompanies,
  scanCompanyVehicles,
} from "../lib/offline-monitoring/company-scan-service.ts";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const THRESHOLD_HOURS = 24;
const OPERATOR = { id: "operator-01", name: "Ana Gómez" };

const VEHICLES = [
  { companyName: "CASCIA GASES", plate: "AA111AA" },
  { companyName: "cascia gases", plate: "AA222AA" },
  { companyName: "TRANSPORTE X", plate: "BB111BB" },
];

const CONTACTS = [
  {
    id: "CYBERMAPA:CASCIA GASES",
    system: "CYBERMAPA",
    companyName: "CASCIA GASES",
    companyKey: "CASCIA GASES",
    contactName: "Contacto",
    whatsappPhone: "5493810000001",
    enabled: true,
    vehicleSource: "manual",
    vehiclePlates: [],
  },
];

function createDependencies(overrides = {}) {
  const requestedPlates = [];
  const reconciled = [];

  return {
    requestedPlates,
    reconciled,
    dependencies: {
      findOperator: async (operatorId) =>
        operatorId === OPERATOR.id ? OPERATOR : null,
      getVehicles: async () => VEHICLES,
      listContacts: async () => CONTACTS,
      getReports: async (plates) => {
        requestedPlates.push(plates);

        return plates.map((plate) => ({
          plate,
          reportedAt: "03/08/2026 06:00:00",
        }));
      },
      reconcile: async (input) => {
        reconciled.push(input);

        return { created: 1, updated: 0, resolved: 0 };
      },
      now: () => NOW,
      thresholdHours: () => THRESHOLD_HOURS,
      ...overrides,
    },
  };
}

test("companies are grouped by normalized name with their vehicle counts", async () => {
  const { dependencies } = createDependencies();
  const companies = await listMonitoringCompanies(dependencies);

  assert.deepEqual(companies, [
    {
      companyKey: "CASCIA GASES",
      companyName: "CASCIA GASES",
      vehicleCount: 2,
      hasContact: true,
    },
    {
      companyKey: "TRANSPORTE X",
      companyName: "TRANSPORTE X",
      vehicleCount: 1,
      hasContact: false,
    },
  ]);
});

test("an unknown operator is rejected before any upstream call", async () => {
  const { requestedPlates, reconciled, dependencies } = createDependencies();
  const result = await scanCompanyVehicles(
    { operatorId: "ghost-operator", companyKey: "CASCIA GASES" },
    dependencies,
  );

  assert.deepEqual(result, { status: "rejected", reason: "unknown_operator" });
  assert.deepEqual(requestedPlates, []);
  assert.deepEqual(reconciled, []);
});

test("a company absent from the platform is rejected without reconciling", async () => {
  const { reconciled, dependencies } = createDependencies();
  const result = await scanCompanyVehicles(
    { operatorId: OPERATOR.id, companyKey: "EMPRESA INEXISTENTE" },
    dependencies,
  );

  assert.deepEqual(result, { status: "rejected", reason: "unknown_company" });
  assert.deepEqual(reconciled, []);
});

test("only the plates of the selected company are requested", async () => {
  const { requestedPlates, dependencies } = createDependencies();

  await scanCompanyVehicles(
    { operatorId: OPERATOR.id, companyKey: "CASCIA GASES" },
    dependencies,
  );

  assert.deepEqual(requestedPlates, [["AA111AA", "AA222AA"]]);
});

test("a company with a contact keeps the contact display name", async () => {
  const { reconciled, dependencies } = createDependencies();
  const result = await scanCompanyVehicles(
    { operatorId: OPERATOR.id, companyKey: "CASCIA GASES" },
    dependencies,
  );

  assert.equal(result.companyName, "CASCIA GASES");

  for (const observation of reconciled[0].observations) {
    assert.equal(observation.companyName, "CASCIA GASES");
  }
});

test("a company without a contact keeps the platform name", async () => {
  const { reconciled, dependencies } = createDependencies();
  const result = await scanCompanyVehicles(
    { operatorId: OPERATOR.id, companyKey: "TRANSPORTE X" },
    dependencies,
  );

  assert.equal(result.companyName, "TRANSPORTE X");
  assert.deepEqual(
    reconciled[0].observations.map((observation) => observation.companyName),
    ["TRANSPORTE X"],
  );
});

test("the reconcile call carries only the scanned company observations", async () => {
  const { reconciled, dependencies } = createDependencies();

  await scanCompanyVehicles(
    { operatorId: OPERATOR.id, companyKey: "CASCIA GASES" },
    dependencies,
  );

  assert.equal(reconciled.length, 1);
  assert.deepEqual(reconciled[0].observations, [
    {
      system: "CYBERMAPA",
      companyName: "CASCIA GASES",
      plate: "AA111AA",
      lastReportedAt: "2026-08-03T09:00:00.000Z",
      offlineHours: 51,
      isOffline: true,
    },
    {
      system: "CYBERMAPA",
      companyName: "CASCIA GASES",
      plate: "AA222AA",
      lastReportedAt: "2026-08-03T09:00:00.000Z",
      offlineHours: 51,
      isOffline: true,
    },
  ]);
  assert.equal(reconciled[0].thresholdHours, THRESHOLD_HOURS);
  assert.equal(reconciled[0].checkedAt, NOW.toISOString());
});

test("the scan reports how many vehicles are delayed and how many report", async () => {
  const { dependencies } = createDependencies({
    getReports: async (plates) =>
      plates.map((plate, index) => ({
        plate,
        reportedAt:
          index === 0 ? "05/08/2026 06:00:00" : "03/08/2026 06:00:00",
      })),
  });

  const result = await scanCompanyVehicles(
    { operatorId: OPERATOR.id, companyKey: "CASCIA GASES" },
    dependencies,
  );

  assert.equal(result.status, "scanned");
  assert.equal(result.vehicleCount, 2);
  assert.equal(result.delayedCount, 1);
  assert.equal(result.reportingCount, 1);
  assert.equal(result.missingReportCount, 0);
});

test("unusable reports are counted as missing and never reconciled", async () => {
  const { reconciled, dependencies } = createDependencies({
    getReports: async () => [
      { plate: "AA111AA", reportedAt: "not a date" },
      { plate: "AA222AA", reportedAt: "06/08/2026 06:00:00" },
    ],
  });

  const result = await scanCompanyVehicles(
    { operatorId: OPERATOR.id, companyKey: "CASCIA GASES" },
    dependencies,
  );

  assert.equal(result.missingReportCount, 2);
  assert.deepEqual(reconciled[0].observations, []);
});

test("an upstream failure surfaces without reconciling anything", async () => {
  const { reconciled, dependencies } = createDependencies({
    getReports: async () => {
      throw new Error("Cybermapa is unreachable.");
    },
  });

  const result = await scanCompanyVehicles(
    { operatorId: OPERATOR.id, companyKey: "CASCIA GASES" },
    dependencies,
  );

  assert.deepEqual(result, {
    status: "upstream_failure",
    reason: "Cybermapa is unreachable.",
  });
  assert.deepEqual(reconciled, []);
});

test("plates are requested in batches of one hundred", async () => {
  const manyVehicles = Array.from({ length: 250 }, (_unused, index) => ({
    companyName: "TRANSPORTE X",
    plate: `AA${String(index).padStart(3, "0")}AA`,
  }));
  const { requestedPlates, dependencies } = createDependencies({
    getVehicles: async () => manyVehicles,
  });

  await scanCompanyVehicles(
    { operatorId: OPERATOR.id, companyKey: "TRANSPORTE X" },
    dependencies,
  );

  assert.deepEqual(
    requestedPlates.map((batch) => batch.length),
    [100, 100, 50],
  );
});
