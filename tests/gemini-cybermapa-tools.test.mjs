import assert from "node:assert/strict";
import test from "node:test";

import { generateGeminiReply } from "../lib/gemini.ts";

test("Gemini tool requests are executed by the backend and returned to the model", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  const requestBodies = [];
  const usedTools = [];
  let requestedIdentifier;
  let requestedIdentifierType;

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
                    name: "get_vehicle_status",
                    args: {
                      identifier: "AA123BB",
                      identifierType: "patente",
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
                text: "La última posición informada corresponde a las 10:30.",
              },
            ],
          },
        },
      ],
    });
  };

  try {
    const reply = await generateGeminiReply({
      userMessage: "¿Dónde está el AA123BB?",
      activeSessionSummary: "",
      recentMessages: [],
      getPreviousConversations: async () => [],
      getAuthorizedVehicles: async () => ({
        status: "ok",
        vehicles: [],
      }),
      getVehicleStatus: async (identifier, identifierType) => {
        requestedIdentifier = identifier;
        requestedIdentifierType = identifierType;
        return {
          status: "ok",
          vehicle: {
            plate: identifier,
            reportedAt: "19/07/2026 10:30:00",
          },
        };
      },
      searchFaq: async () => ({
        status: "no_match",
        matches: [],
      }),
      onToolUse: async (toolName) => {
        usedTools.push(toolName);
      },
    });

    assert.equal(
      reply,
      "La última posición informada corresponde a las 10:30.",
    );
    assert.equal(requestedIdentifier, "AA123BB");
    assert.equal(requestedIdentifierType, "patente");
    assert.deepEqual(usedTools, ["get_vehicle_status"]);
    assert.equal(requestBodies.length, 2);

    const functionResponse =
      requestBodies[1].contents.at(-1).parts[0].functionResponse;
    assert.equal(functionResponse.name, "get_vehicle_status");
    assert.equal(
      functionResponse.response.result.vehicle.plate,
      "AA123BB",
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
