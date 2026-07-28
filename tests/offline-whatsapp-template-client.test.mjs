import assert from "node:assert/strict";
import test from "node:test";

import {
  getOfflineTemplateIdentity,
  OfflineTemplateRejectedError,
  sendOfflineNotificationTemplate,
} from "../lib/offline-monitoring/whatsapp-template-client.ts";

const config = {
  name: "vehicle_offline_followup",
  language: "es_AR",
  accessToken: "secret-token",
  phoneNumberId: "123456",
  apiVersion: "v25.0",
};

test("offline template defaults match the submitted Meta template", () => {
  assert.deepEqual(getOfflineTemplateIdentity({}), {
    name: "vehicle_offline_followup",
    language: "es_AR",
  });
});

test("offline template sends the three approved body variables", async () => {
  let capturedRequest;

  const messageId = await sendOfflineNotificationTemplate(
    {
      to: "5493810000000",
      contactName: "Martina",
      vehicleCount: 3,
      vehicleList:
        "AA123BB (20/07/2026 08:30) • AB456CD (19/07/2026 14:15)",
    },
    config,
    async (input, init) => {
      capturedRequest = { input, init };
      return Response.json({ messages: [{ id: "wamid.test" }] });
    },
  );

  assert.equal(messageId, "wamid.test");
  assert.equal(
    capturedRequest.input,
    "https://graph.facebook.com/v25.0/123456/messages",
  );
  const body = JSON.parse(capturedRequest.init.body);
  assert.equal(body.type, "template");
  assert.equal(body.template.name, "vehicle_offline_followup");
  assert.equal(body.template.language.code, "es_AR");
  assert.deepEqual(
    body.template.components[0].parameters.map((parameter) => parameter.text),
    [
      "Martina",
      "3",
      "AA123BB (20/07/2026 08:30) • AB456CD (19/07/2026 14:15)",
    ],
  );
});

test("offline template errors redact the access token", async () => {
  await assert.rejects(
    () =>
      sendOfflineNotificationTemplate(
        {
          to: "5493810000000",
          contactName: "Martina",
          vehicleCount: 1,
          vehicleList: "AA123BB (20/07/2026 08:30)",
        },
        config,
        async () =>
          Response.json(
            {
              error: {
                message: `Rejected ${config.accessToken}`,
                code: 100,
              },
            },
            { status: 400 },
          ),
      ),
    (error) => {
      assert.equal(error instanceof OfflineTemplateRejectedError, true);
      assert.equal(error.retrySafe, true);
      assert.equal(error.message.includes(config.accessToken), false);
      assert.match(error.message, /\[redacted\]/);
      assert.match(error.message, /code=100/);
      return true;
    },
  );
});
