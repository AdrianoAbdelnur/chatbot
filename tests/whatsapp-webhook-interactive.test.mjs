import assert from "node:assert/strict";
import test from "node:test";

import { parseIncomingMessages } from "../lib/whatsapp-webhook-parser.ts";

test("WhatsApp webhook parser preserves handoff button replies and context", () => {
  const messages = parseIncomingMessages({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [
                {
                  wa_id: "5491112345678",
                  profile: {
                    name: "Test User",
                  },
                },
              ],
              messages: [
                {
                  id: "wamid.confirmation",
                  from: "5491112345678",
                  timestamp: "1785276000",
                  type: "interactive",
                  context: {
                    id: "wamid.offer",
                  },
                  interactive: {
                    type: "button_reply",
                    button_reply: {
                      id: "human_handoff_confirm",
                      title: "Hablar con operador",
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "interactive");
  assert.equal(messages[0].text, "Hablar con operador");
  assert.equal(
    messages[0].interactiveReplyId,
    "human_handoff_confirm",
  );
  assert.equal(messages[0].contextMessageId, "wamid.offer");
});
