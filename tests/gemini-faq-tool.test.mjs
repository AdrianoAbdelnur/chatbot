import assert from "node:assert/strict";
import test from "node:test";

import { generateGeminiReply } from "../lib/gemini.ts";

test("Gemini FAQ searches are executed by the backend and returned to the model", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  const requestBodies = [];
  let searchedQuery;

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
                      query: "¿Cuánto tarda una instalación?",
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
                text: "Una instalación simple demora entre 45 minutos y 2 horas.",
              },
            ],
          },
        },
      ],
    });
  };

  try {
    const reply = await generateGeminiReply({
      userMessage: "¿Cuánto tarda una instalación?",
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
      searchFaq: async (query) => {
        searchedQuery = query;
        return {
          status: "ok",
          matches: [
            {
              question: "¿Cuánto demora una instalación?",
              answer:
                "Una instalación simple demora entre 45 minutos y 2 horas.",
              score: 0.91,
            },
          ],
        };
      },
    });

    assert.equal(
      searchedQuery,
      "¿Cuánto tarda una instalación?",
    );
    assert.equal(
      reply,
      "Una instalación simple demora entre 45 minutos y 2 horas.",
    );
    assert.equal(
      requestBodies[1].contents.at(-1).parts[0].functionResponse.name,
      "search_faq",
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
