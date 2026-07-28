import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  GET,
  isAuthorizedCronRequest,
} from "../app/api/cron/offline-vehicles/route.ts";

test("cron authorization requires the configured bearer secret", () => {
  const environment = { CRON_SECRET: "daily-secret" };

  assert.equal(
    isAuthorizedCronRequest(
      new Request("https://example.test/api/cron/offline-vehicles", {
        headers: { authorization: "Bearer daily-secret" },
      }),
      environment,
    ),
    true,
  );
  assert.equal(
    isAuthorizedCronRequest(
      new Request("https://example.test/api/cron/offline-vehicles", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
      environment,
    ),
    false,
  );
  assert.equal(
    isAuthorizedCronRequest(
      new Request("https://example.test/api/cron/offline-vehicles"),
      environment,
    ),
    false,
  );
});

test("unauthorized cron requests do not execute the daily job", async () => {
  const response = await GET(
    new Request("https://example.test/api/cron/offline-vehicles"),
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { success: false });
});

test("Vercel schedules the daily job for 09:00 Argentina time", () => {
  const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

  assert.deepEqual(config.crons, [
    {
      path: "/api/cron/offline-vehicles",
      schedule: "0 12 * * *",
    },
  ]);
});
