import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHumanHandoffLink,
  buildHumanHandoffOfferPayload,
  createHumanHandoffOffer,
  isHumanHandoffConfigured,
} from "../lib/whatsapp-human-handoff.ts";

test("human handoff offers use a WhatsApp reply button with a stable ID", () => {
  assert.deepEqual(buildHumanHandoffOfferPayload(), {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text:
          "No pude resolver tu consulta. ¿Querés hablar con un operador humano?",
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "human_handoff_confirm",
              title: "Hablar con operador",
            },
          },
        ],
      },
    },
  });
});

test("human handoff offers normalize and limit model-provided text", () => {
  const offer = createHumanHandoffOffer(
    "  No FAQ match  ",
    "  El usuario necesita   conocer un procedimiento no documentado.  ",
  );

  assert.deepEqual(offer, {
    type: "human_handoff_offer",
    reason: "No FAQ match",
    summary:
      "El usuario necesita conocer un procedimiento no documentado.",
  });
});

test("human handoff links target the configured number with a prefilled summary", () => {
  const originalPhone = process.env.HUMAN_SUPPORT_PHONE;
  process.env.HUMAN_SUPPORT_PHONE = "+54 9 11 1234-5678";

  try {
    assert.equal(isHumanHandoffConfigured(), true);

    const link = new URL(
      buildHumanHandoffLink("Necesita ayuda con el pedido 123."),
    );

    assert.equal(link.origin, "https://wa.me");
    assert.equal(link.pathname, "/5491112345678");
    assert.equal(
      link.searchParams.get("text"),
      [
        "Hola. El chatbot no pudo resolver mi consulta y me derivó con un operador.",
        "Resumen: Necesita ayuda con el pedido 123.",
      ].join("\n\n"),
    );
  } finally {
    if (originalPhone === undefined) {
      delete process.env.HUMAN_SUPPORT_PHONE;
    } else {
      process.env.HUMAN_SUPPORT_PHONE = originalPhone;
    }
  }
});

test("human handoff remains unavailable without a valid target number", () => {
  const originalPhone = process.env.HUMAN_SUPPORT_PHONE;
  process.env.HUMAN_SUPPORT_PHONE = "invalid";

  try {
    assert.equal(isHumanHandoffConfigured(), false);
    assert.throws(
      () => buildHumanHandoffLink("Consulta pendiente."),
      /not configured/,
    );
  } finally {
    if (originalPhone === undefined) {
      delete process.env.HUMAN_SUPPORT_PHONE;
    } else {
      process.env.HUMAN_SUPPORT_PHONE = originalPhone;
    }
  }
});
