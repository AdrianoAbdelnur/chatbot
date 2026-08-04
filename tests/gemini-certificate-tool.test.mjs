import assert from "node:assert/strict";
import test from "node:test";

import { generateGeminiReply } from "../lib/gemini.ts";

function buildOptions(overrides = {}) {
  return {
    userMessage: "Me pasás el certificado de JIO573?",
    activeSessionSummary: "",
    recentMessages: [],
    getPreviousConversations: async () => [],
    getAuthorizedVehicles: async () => ({ status: "ok", vehicles: [] }),
    getVehicleStatus: async () => ({ status: "vehicle_not_found" }),
    searchFaq: async () => ({ status: "no_match" }),
    issueCoverageCertificates: async () => ({
      status: "issued",
      issued: [{ plate: "JIO573", reportedAt: "2026-07-31T16:43:34.000Z" }],
      failed: [],
    }),
    ...overrides,
  };
}

function stubGemini(functionCallArgs, followUpText) {
  const requestBodies = [];

  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(init.body));

    if (requestBodies.length === 1) {
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              role: "model",
              parts: [
                {
                  functionCall: {
                    name: "issue_coverage_certificate",
                    args: functionCallArgs,
                  },
                },
              ],
            },
          },
        ],
      });
    }

    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { role: "model", parts: [{ text: followUpText }] },
        },
      ],
    });
  };

  return requestBodies;
}

test("the certificate reply is returned verbatim and the model never speaks again", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;

  process.env.GEMINI_API_KEY = "test-api-key";
  process.env.GEMINI_MODEL = "gemini-test-model";

  const requestBodies = stubGemini(
    { plates: ["JIO573"] },
    "El vehículo está funcionando perfecto y ya te mando todo.",
  );

  try {
    const reply = await generateGeminiReply(buildOptions());

    assert.equal(
      reply,
      "Te envío el certificado de cobertura de JIO573.",
    );
    // A second Gemini round would let the model reword the certificate.
    assert.equal(requestBodies.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
    process.env.GEMINI_MODEL = originalModel;
  }
});

test("a refusal reaches the user exactly as the backend wrote it", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;

  process.env.GEMINI_API_KEY = "test-api-key";
  process.env.GEMINI_MODEL = "gemini-test-model";

  stubGemini(
    { plates: ["AC840HT"] },
    "Ya verifiqué de nuevo y en realidad sí está reportando.",
  );

  try {
    const reply = await generateGeminiReply(
      buildOptions({
        issueCoverageCertificates: async () => ({
          status: "none_eligible",
          ineligible: [
            { plate: "AC840HT", reason: "no_recent_report" },
          ],
        }),
      }),
    );

    assert.ok(reply.startsWith("No puedo emitir el certificado todavía."));
    assert.ok(reply.includes("no registra reportes en la última hora"));
    assert.ok(!reply.includes("sí está reportando"));
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
    process.env.GEMINI_MODEL = originalModel;
  }
});

test("the confirmation flag is forwarded to the backend", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  let receivedConfirmation;

  process.env.GEMINI_API_KEY = "test-api-key";
  process.env.GEMINI_MODEL = "gemini-test-model";

  stubGemini(
    { plates: ["JIO573", "AC840HT"], confirmedPartialIssue: true },
    "ignored",
  );

  try {
    await generateGeminiReply(
      buildOptions({
        issueCoverageCertificates: async (_plates, confirmedPartialIssue) => {
          receivedConfirmation = confirmedPartialIssue;

          return {
            status: "issued",
            issued: [
              { plate: "JIO573", reportedAt: "2026-07-31T16:43:34.000Z" },
            ],
            failed: [
              { plate: "AC840HT", reason: "no_recent_report" },
            ],
          };
        },
      }),
    );

    assert.equal(receivedConfirmation, true);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
    process.env.GEMINI_MODEL = originalModel;
  }
});
