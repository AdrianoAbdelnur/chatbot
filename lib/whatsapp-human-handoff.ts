export const HUMAN_HANDOFF_TOOL_NAME = "offer_human_handoff";
export const HUMAN_HANDOFF_CONFIRM_BUTTON_ID = "human_handoff_confirm";
export const HUMAN_HANDOFF_OFFER_TEXT =
  "No pude resolver tu consulta. ¿Querés hablar con un operador humano?";
export const HUMAN_HANDOFF_CONFIRM_BUTTON_TITLE = "Hablar con operador";

const MAX_HANDOFF_REASON_LENGTH = 160;
const MAX_HANDOFF_SUMMARY_LENGTH = 400;

export type HumanHandoffOffer = {
  type: "human_handoff_offer";
  reason: string;
  summary: string;
};

function normalizeRequiredText(
  value: unknown,
  fieldName: string,
  maxLength: number,
) {
  if (typeof value !== "string") {
    throw new Error(`Human handoff ${fieldName} is invalid.`);
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    throw new Error(`Human handoff ${fieldName} is empty.`);
  }

  return normalized.slice(0, maxLength);
}

export function createHumanHandoffOffer(
  reason: unknown,
  summary: unknown,
): HumanHandoffOffer {
  return {
    type: "human_handoff_offer",
    reason: normalizeRequiredText(
      reason,
      "reason",
      MAX_HANDOFF_REASON_LENGTH,
    ),
    summary: normalizeRequiredText(
      summary,
      "summary",
      MAX_HANDOFF_SUMMARY_LENGTH,
    ),
  };
}

export function getHumanSupportPhone() {
  const phone = (process.env.HUMAN_SUPPORT_PHONE ?? "").replace(/\D/g, "");

  if (!/^\d{8,15}$/.test(phone)) {
    throw new Error("Human support phone is not configured.");
  }

  return phone;
}

export function isHumanHandoffConfigured() {
  try {
    getHumanSupportPhone();
    return true;
  } catch {
    return false;
  }
}

export function buildHumanHandoffOfferPayload() {
  return {
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: HUMAN_HANDOFF_OFFER_TEXT,
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: HUMAN_HANDOFF_CONFIRM_BUTTON_ID,
              title: HUMAN_HANDOFF_CONFIRM_BUTTON_TITLE,
            },
          },
        ],
      },
    },
  };
}

export function buildHumanHandoffLink(summary: string) {
  const phone = getHumanSupportPhone();
  const normalizedSummary = normalizeRequiredText(
    summary,
    "summary",
    MAX_HANDOFF_SUMMARY_LENGTH,
  );
  const message = [
    "Hola. El chatbot no pudo resolver mi consulta y me derivó con un operador.",
    `Resumen: ${normalizedSummary}`,
  ].join("\n\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
