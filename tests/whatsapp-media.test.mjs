import assert from "node:assert/strict";
import test from "node:test";

import {
  getWhatsAppMediaConfig,
  sendWhatsAppDocument,
  uploadWhatsAppDocument,
} from "../lib/whatsapp-media.ts";

const config = {
  accessToken: "secret-token",
  phoneNumberId: "123456",
  apiVersion: "v25.0",
};

test("the media config falls back to the default API version", () => {
  assert.deepEqual(
    getWhatsAppMediaConfig({
      WHATSAPP_ACCESS_TOKEN: "token",
      WHATSAPP_PHONE_NUMBER_ID: "999",
    }),
    { accessToken: "token", phoneNumberId: "999", apiVersion: "v25.0" },
  );
});

test("the media config rejects an incomplete setup", () => {
  assert.throws(
    () => getWhatsAppMediaConfig({ WHATSAPP_ACCESS_TOKEN: "token" }),
    /not configured/,
  );
  assert.throws(
    () =>
      getWhatsAppMediaConfig({
        WHATSAPP_ACCESS_TOKEN: "token",
        WHATSAPP_PHONE_NUMBER_ID: "999",
        WHATSAPP_API_VERSION: "25",
      }),
    /invalid format/,
  );
});

test("the document is uploaded as multipart PDF and returns its media ID", async () => {
  let capturedRequest;

  const mediaId = await uploadWhatsAppDocument(
    {
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      filename: "Certificado de cobertura JIO573.pdf",
    },
    config,
    async (input, init) => {
      capturedRequest = { input, init };
      return Response.json({ id: "media-1" });
    },
  );

  assert.equal(mediaId, "media-1");
  assert.equal(
    capturedRequest.input,
    "https://graph.facebook.com/v25.0/123456/media",
  );
  assert.equal(
    capturedRequest.init.headers.Authorization,
    "Bearer secret-token",
  );

  const form = capturedRequest.init.body;

  assert.equal(form.get("messaging_product"), "whatsapp");
  assert.equal(form.get("type"), "application/pdf");
  assert.equal(
    form.get("file").name,
    "Certificado de cobertura JIO573.pdf",
  );
  assert.equal(form.get("file").type, "application/pdf");
});

test("an upload rejected by Meta never leaks the access token", async () => {
  await assert.rejects(
    uploadWhatsAppDocument(
      { bytes: new Uint8Array([1]), filename: "x.pdf" },
      config,
      async () =>
        Response.json(
          { error: { message: "Bad token secret-token" } },
          { status: 401 },
        ),
    ),
    (error) => {
      assert.ok(!error.message.includes("secret-token"));
      return true;
    },
  );
});

test("an upload without a media ID is treated as a failure", async () => {
  await assert.rejects(
    uploadWhatsAppDocument(
      { bytes: new Uint8Array([1]), filename: "x.pdf" },
      config,
      async () => Response.json({}),
    ),
    /did not return a media ID/,
  );
});

test("the document message references the uploaded media", async () => {
  let capturedRequest;

  const messageId = await sendWhatsAppDocument(
    {
      to: "5493810000000",
      mediaId: "media-1",
      filename: "Certificado de cobertura JIO573.pdf",
      caption: "Certificado de cobertura JIO573",
    },
    config,
    async (input, init) => {
      capturedRequest = { input, init };
      return Response.json({ messages: [{ id: "wamid.doc" }] });
    },
  );

  assert.equal(messageId, "wamid.doc");
  assert.equal(
    capturedRequest.input,
    "https://graph.facebook.com/v25.0/123456/messages",
  );

  const body = JSON.parse(capturedRequest.init.body);

  assert.equal(body.type, "document");
  assert.equal(body.document.id, "media-1");
  assert.equal(
    body.document.filename,
    "Certificado de cobertura JIO573.pdf",
  );
  assert.equal(body.document.caption, "Certificado de cobertura JIO573");
});

test("a document without caption omits the field entirely", async () => {
  let capturedRequest;

  await sendWhatsAppDocument(
    {
      to: "5493810000000",
      mediaId: "media-1",
      filename: "x.pdf",
    },
    config,
    async (input, init) => {
      capturedRequest = { input, init };
      return Response.json({ messages: [{ id: "wamid.doc" }] });
    },
  );

  assert.ok(
    !("caption" in JSON.parse(capturedRequest.init.body).document),
  );
});
