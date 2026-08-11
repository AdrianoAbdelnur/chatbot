import assert from "node:assert/strict";
import test from "node:test";

import { evaluateCertificateEligibility } from "../lib/certificates/eligibility.ts";
import { VEHICLE_SERVICE_FEATURE_KEYS } from "../lib/certificates/types.ts";

const NOW = new Date("2026-07-31T14:00:00.000Z");
const ARGENTINA_OFFSET_MS = 3 * 60 * 60 * 1_000;

/**
 * Cybermapa reports Argentina local time, so a fixture has to be written in
 * that timezone for the parser to land on the intended instant.
 */
function reportedMinutesAgo(minutes) {
  const localDate = new Date(
    NOW.getTime() - minutes * 60_000 - ARGENTINA_OFFSET_MS,
  );
  const pad = (value) => String(value).padStart(2, "0");

  return [
    `${localDate.getUTCFullYear()}-${pad(localDate.getUTCMonth() + 1)}-${pad(localDate.getUTCDate())}`,
    `${pad(localDate.getUTCHours())}:${pad(localDate.getUTCMinutes())}:${pad(localDate.getUTCSeconds())}`,
  ].join(" ");
}

function buildFeatures(overrides = {}) {
  const features = {};

  for (const key of VEHICLE_SERVICE_FEATURE_KEYS) {
    features[key] = overrides[key] ?? false;
  }

  return features;
}

function buildServiceRecords(plates) {
  return new Map(
    plates.map((plate) => [
      plate,
      {
        plate,
        companyName: "FURGONES La Sevillanita",
        features: buildFeatures({ powerCut: true, panicAlarm: true }),
        updatedAt: NOW.toISOString(),
      },
    ]),
  );
}

function evaluate(overrides) {
  return evaluateCertificateEligibility({
    requestedPlates: ["JIO573"],
    authorization: {
      whatsappPhone: "5493815550000",
      allowAllVehicles: true,
      allowedVehicles: [],
    },
    reports: [{ plate: "JIO573", reportedAt: reportedMinutesAgo(10) }],
    serviceRecords: buildServiceRecords(["JIO573"]),
    now: NOW,
    windowMinutes: 60,
    ...overrides,
  });
}

test("a vehicle reporting inside the window is eligible", () => {
  const result = evaluate();

  assert.equal(result.status, "all_eligible");
  assert.equal(result.eligible[0].plate, "JIO573");
  assert.equal(result.eligible[0].features.powerCut, true);
  assert.equal(result.eligible[0].reportedAt, "2026-07-31T13:50:00.000Z");
});

test("a stale report blocks the certificate", () => {
  const result = evaluate({
    reports: [{ plate: "JIO573", reportedAt: reportedMinutesAgo(61) }],
  });

  assert.equal(result.status, "none_eligible");
  assert.deepEqual(result.ineligible, [
    { plate: "JIO573", reason: "no_recent_report" },
  ]);
});

test("a report exactly at the window edge still counts", () => {
  const result = evaluate({
    reports: [{ plate: "JIO573", reportedAt: reportedMinutesAgo(60) }],
  });

  assert.equal(result.status, "all_eligible");
});

test("a missing report blocks the certificate", () => {
  const result = evaluate({ reports: [] });

  assert.equal(result.status, "none_eligible");
  assert.equal(result.ineligible[0].reason, "no_recent_report");
});

test("a timestamp in the future is not accepted as evidence", () => {
  const result = evaluate({
    reports: [{ plate: "JIO573", reportedAt: reportedMinutesAgo(-30) }],
  });

  assert.equal(result.status, "none_eligible");
  assert.equal(result.ineligible[0].reason, "no_recent_report");
});

test("a mixed batch is reported as partially eligible", () => {
  const result = evaluate({
    requestedPlates: ["JIO573", "JIO574", "AA111BB"],
    reports: [
      { plate: "JIO573", reportedAt: reportedMinutesAgo(5) },
      { plate: "JIO574", reportedAt: reportedMinutesAgo(20) },
      { plate: "AA111BB", reportedAt: reportedMinutesAgo(180) },
    ],
    serviceRecords: buildServiceRecords(["JIO573", "JIO574", "AA111BB"]),
  });

  assert.equal(result.status, "partially_eligible");
  assert.deepEqual(
    result.eligible.map((vehicle) => vehicle.plate),
    ["JIO573", "JIO574"],
  );
  assert.deepEqual(result.ineligible, [
    { plate: "AA111BB", reason: "no_recent_report" },
  ]);
});

test("an unauthorized plate never reaches the report check", () => {
  const result = evaluate({
    requestedPlates: ["AA111BB"],
    authorization: {
      whatsappPhone: "5493815550000",
      allowAllVehicles: false,
      allowedVehicles: ["JIO573"],
    },
    reports: [{ plate: "AA111BB", reportedAt: reportedMinutesAgo(1) }],
    serviceRecords: buildServiceRecords(["AA111BB"]),
  });

  assert.equal(result.status, "none_eligible");
  assert.equal(result.ineligible[0].reason, "vehicle_not_authorized");
});

test("a vehicle without service data cannot be certified", () => {
  const result = evaluate({ serviceRecords: new Map() });

  assert.equal(result.status, "none_eligible");
  assert.equal(result.ineligible[0].reason, "no_service_data");
});

test("an unusable plate is reported instead of silently dropped", () => {
  const result = evaluate({ requestedPlates: ["A1"] });

  assert.equal(result.ineligible[0].reason, "invalid_plate");
  assert.equal(result.ineligible[0].plate, "A1");
});

test("repeated plates are evaluated once", () => {
  const result = evaluate({
    requestedPlates: ["JIO573", "jio 573", "JIO-573"],
  });

  assert.equal(result.status, "all_eligible");
  assert.equal(result.eligible.length, 1);
});
