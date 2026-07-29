import type { IncomingWhatsAppMessage } from "./whatsapp-message-store.ts";

type WhatsAppContact = {
  profile?: {
    name?: unknown;
  };
  wa_id?: unknown;
};

type WhatsAppWebhookMessage = {
  from?: unknown;
  id?: unknown;
  timestamp?: unknown;
  type?: unknown;
  text?: {
    body?: unknown;
  };
  context?: {
    id?: unknown;
  };
  interactive?: {
    type?: unknown;
    button_reply?: {
      id?: unknown;
      title?: unknown;
    };
  };
};

type WhatsAppWebhookValue = {
  contacts?: unknown;
  messages?: unknown;
};

type WhatsAppWebhookPayload = {
  object?: unknown;
  entry?: unknown;
};

function getMessageText(message: WhatsAppWebhookMessage) {
  if (
    message.type === "text" &&
    message.text &&
    typeof message.text.body === "string"
  ) {
    return message.text.body;
  }

  if (
    message.type === "interactive" &&
    message.interactive?.type === "button_reply" &&
    typeof message.interactive.button_reply?.title === "string"
  ) {
    return message.interactive.button_reply.title;
  }

  const type = typeof message.type === "string" ? message.type : "unknown";
  return `[${type} message]`;
}

export function parseIncomingMessages(
  payload: unknown,
): IncomingWhatsAppMessage[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const webhookPayload = payload as WhatsAppWebhookPayload;

  if (
    webhookPayload.object !== "whatsapp_business_account" ||
    !Array.isArray(webhookPayload.entry)
  ) {
    return [];
  }

  const incomingMessages: IncomingWhatsAppMessage[] = [];

  for (const entry of webhookPayload.entry) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const changes = (entry as { changes?: unknown }).changes;

    if (!Array.isArray(changes)) {
      continue;
    }

    for (const change of changes) {
      if (!change || typeof change !== "object") {
        continue;
      }

      const value = (change as { value?: unknown }).value;

      if (!value || typeof value !== "object") {
        continue;
      }

      const webhookValue = value as WhatsAppWebhookValue;
      const messages = webhookValue.messages;
      const contacts = Array.isArray(webhookValue.contacts)
        ? (webhookValue.contacts as WhatsAppContact[])
        : [];

      if (!Array.isArray(messages)) {
        continue;
      }

      for (const rawMessage of messages) {
        if (!rawMessage || typeof rawMessage !== "object") {
          continue;
        }

        const message = rawMessage as WhatsAppWebhookMessage;

        if (
          typeof message.id !== "string" ||
          typeof message.from !== "string"
        ) {
          continue;
        }

        const contact = contacts.find(
          (item) => item && item.wa_id === message.from,
        );
        const profileName =
          contact?.profile && typeof contact.profile.name === "string"
            ? contact.profile.name
            : undefined;
        const unixTimestamp =
          typeof message.timestamp === "string"
            ? Number(message.timestamp)
            : Number.NaN;

        incomingMessages.push({
          id: message.id,
          from: message.from,
          profileName,
          type: typeof message.type === "string" ? message.type : "unknown",
          text: getMessageText(message),
          ...(message.type === "interactive" &&
          message.interactive?.type === "button_reply" &&
          typeof message.interactive.button_reply?.id === "string"
            ? {
                interactiveReplyId: message.interactive.button_reply.id,
              }
            : {}),
          ...(message.context && typeof message.context.id === "string"
            ? { contextMessageId: message.context.id }
            : {}),
          receivedAt: Number.isFinite(unixTimestamp)
            ? new Date(unixTimestamp * 1000).toISOString()
            : new Date().toISOString(),
        });
      }
    }
  }

  return incomingMessages;
}
