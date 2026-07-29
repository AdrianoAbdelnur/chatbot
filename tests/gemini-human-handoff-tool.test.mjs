import assert from "node:assert/strict";
import test from "node:test";

import { generateGeminiReply } from "../lib/gemini.ts";

test("Gemini can request a human handoff after FAQ search cannot resolve the request", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  const requestBodies = [];
  const usedTools = [];

  process.env.GEMINI_API_KEY = "test-api-key";
  process.env.GEMINI_MODEL = "gemini-test-model";
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
                    name: "search_faq",
                    args: {
                      query: "¿Pueden modificar mi contrato?",
                    },
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
          content: {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "offer_human_handoff",
                  args: {
                    reason: "La información contractual no está disponible.",
                    summary:
                      "El usuario consulta si pueden modificar su contrato.",
                  },
                },
              },
            ],
          },
        },
      ],
    });
  };

  try {
    const reply = await generateGeminiReply({
      userMessage: "¿Pueden modificar mi contrato?",
      activeSessionSummary: "",
      recentMessages: [],
      getPreviousConversations: async () => [],
      getAuthorizedVehicles: async () => ({
        status: "ok",
        vehicles: [],
      }),
      getVehicleStatus: async () => ({
        status: "not_authorized",
      }),
      searchFaq: async () => ({
        status: "no_match",
        matches: [],
      }),
      humanHandoffAvailable: true,
      onToolUse: async (toolName) => {
        usedTools.push(toolName);
      },
    });

    assert.deepEqual(reply, {
      type: "human_handoff_offer",
      reason: "La información contractual no está disponible.",
      summary: "El usuario consulta si pueden modificar su contrato.",
    });
    assert.deepEqual(usedTools, [
      "search_faq",
      "offer_human_handoff",
    ]);
    assert.equal(requestBodies.length, 2);
    assert.equal(
      requestBodies[0].tools[0].functionDeclarations.some(
        (declaration) => declaration.name === "offer_human_handoff",
      ),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;

    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalApiKey;
    }

    if (originalModel === undefined) {
      delete process.env.GEMINI_MODEL;
    } else {
      process.env.GEMINI_MODEL = originalModel;
    }
  }
});
