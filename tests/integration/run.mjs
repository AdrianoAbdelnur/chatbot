import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";

import { isMongoIntegrationUriConfigured } from "../../lib/test-support/mongo-integration.ts";

if (!isMongoIntegrationUriConfigured()) {
  console.log(
    "INTEGRATION TEST PREREQUISITE: Set MONGO_INTEGRATION_TEST_URI to a dedicated non-production MongoDB URI. Mongo integration tests were not run.",
  );
  process.exitCode = 0;
} else {
  const files = (await readdir(new URL(".", import.meta.url)))
    .filter((file) => file.endsWith(".test.mjs"))
    .map((file) => new URL(file, import.meta.url).pathname);
  const child = spawn(
    process.execPath,
    ["--test", "--experimental-strip-types", ...files],
    { stdio: "inherit", env: process.env },
  );
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
