import assert from "node:assert/strict";
import test from "node:test";

import { createCybermapaClient } from "../lib/cybermapa/client.ts";
import { CybermapaError } from "../lib/cybermapa/errors.ts";

const config = {
  apiUrl: "https://cybermapa.example/api",
  user: "server-user",
  password: "server-password",
  timeoutMs: 1_000,
};

test("the Cybermapa client keeps action and credentials under server control", async () => {
  let capturedRequest;
  const client = createCybermapaClient(
    config,
    async (input, init) => {
      capturedRequest = { input, init };
      return Response.json([]);
    },
  );

  await client.request("DATOSACTUALES", {
    action: "DELPERSONA",
    user: "attacker",
    pwd: "attacker",
    vehiculos: ["ABC123"],
  });

  assert.equal(capturedRequest.input, config.apiUrl);
  assert.equal(capturedRequest.init.method, "POST");
  assert.equal(
    capturedRequest.init.headers["Content-Type"],
    "application/json",
  );
  assert.deepEqual(JSON.parse(capturedRequest.init.body), {
    action: "DATOSACTUALES",
    user: config.user,
    pwd: config.password,
    vehiculos: ["ABC123"],
  });
});

test("the Cybermapa client returns a safe HTTP error", async () => {
  const client = createCybermapaClient(config, async () =>
    Response.json(
      {
        error: `Rejected ${config.password}`,
      },
      { status: 401 },
    ),
  );

  await assert.rejects(
    () => client.request("GETVEHICULOS"),
    (error) => {
      assert.ok(error instanceof CybermapaError);
      assert.equal(error.code, "request_failed");
      assert.equal(error.status, 401);
      assert.equal(error.message.includes(config.password), false);
      return true;
    },
  );
});

test("the Cybermapa client rejects non-JSON success responses", async () => {
  const client = createCybermapaClient(
    config,
    async () =>
      new Response("<html>invalid</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
  );

  await assert.rejects(
    () => client.request("GETVEHICULOS"),
    (error) =>
      error instanceof CybermapaError &&
      error.code === "invalid_response",
  );
});
