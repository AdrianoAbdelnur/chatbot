import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateOfflineHours,
  normalizeMonitoringCompanyName,
  parseCybermapaReportedAt,
} from "../lib/offline-monitoring/normalizers.ts";

test("company names are decoded and normalized for matching", () => {
  assert.equal(
    normalizeMonitoringCompanyName("  La%20Sevillanita  "),
    "LA SEVILLANITA",
  );
});

test("Cybermapa ISO timestamps are interpreted as Argentina local time", () => {
  assert.equal(
    parseCybermapaReportedAt("2026-06-11%2010:19:23.123")?.toISOString(),
    "2026-06-11T13:19:23.123Z",
  );
});

test("Cybermapa day-first timestamps accept single-digit hours", () => {
  assert.equal(
    parseCybermapaReportedAt("18/04/2026 6:04:05")?.toISOString(),
    "2026-04-18T09:04:05.000Z",
  );
});

test("invalid and impossible Cybermapa dates are rejected", () => {
  assert.equal(parseCybermapaReportedAt("not-a-date"), null);
  assert.equal(parseCybermapaReportedAt("31/02/2026 10:00:00"), null);
});

test("offline hours are calculated from the last report", () => {
  assert.equal(
    calculateOfflineHours(
      new Date("2026-07-22T12:00:00.000Z"),
      new Date("2026-07-20T12:00:00.000Z"),
    ),
    48,
  );
});
