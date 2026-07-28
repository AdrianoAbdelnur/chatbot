import {
  generateConversationSummary,
  generateGeminiReply,
  type GeminiConversationMessage,
} from "@/lib/gemini";
import {
  getVehicleStatusForAgent,
  listAuthorizedVehiclesForAgent,
} from "@/lib/cybermapa/agent-tools";
import {
  getConversationSummaryWork,
  getPreviousConversationContext,
  saveConversationSummary,
  startOrContinueConversation,
} from "@/lib/whatsapp-conversation-store";
import {
  addOutgoingMessage,
  getRecentConversationExchanges,
  getReplyDestination,
  markIncomingAgentToolUse,
  markIncomingHistoryLookup,
  type IncomingWhatsAppMessage,
  setIncomingAutoReplyResult,
} from "@/lib/whatsapp-message-store";
import { getAutomaticReplyMetaFailureReason } from "@/lib/whatsapp-meta-error";
import { searchFaqForAgent } from "@/lib/faq/store";

type MetaSuccessResponse = {
  messages?: Array<{
    id?: unknown;
  }>;
};

const RECENT_ACTIVE_SESSION_EXCHANGES = 10;
const TYPING_REFRESH_INTERVAL_MS = 20_000;
const TEMPORARY_AI_FAILURE_REPLY =
  "Estoy teniendo una demora temporal para procesar tu consulta. Esperá un minuto y volvé a intentarlo.";

function getWhatsAppConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v25.0";

  if (!accessToken || !phoneNumberId || !/^v\d+\.\d+$/.test(apiVersion)) {
    throw new Error("WhatsApp Cloud API is not configured.");
  }

  return {
    accessToken,
    messagesUrl: `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
  };
}

async function markMessageReadAndShowTyping(messageId: string) {
  const { accessToken, messagesUrl } = getWhatsAppConfig();
  const response = await fetch(messagesUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: {
        type: "text",
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error("Meta could not activate the typing indicator.");
  }
}

async function waitForGeminiRetry(messageId: string, delayMs: number) {
  let remainingMs = delayMs;

  while (remainingMs > 0) {
    const currentWaitMs = Math.min(
      remainingMs,
      TYPING_REFRESH_INTERVAL_MS,
    );

    await new Promise((resolve) => setTimeout(resolve, currentWaitMs));
    remainingMs -= currentWaitMs;

    if (remainingMs > 0) {
      await markMessageReadAndShowTyping(messageId).catch(() => undefined);
    }
  }
}

async function sendWhatsAppReply(to: string, message: string) {
  const { accessToken, messagesUrl } = getWhatsAppConfig();
  const response = await fetch(
    messagesUrl,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          body: message,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      getAutomaticReplyMetaFailureReason(payload, accessToken),
    );
  }

  const firstMessage =
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as MetaSuccessResponse).messages)
      ? (payload as MetaSuccessResponse).messages?.[0]
      : undefined;
  const messageId =
    firstMessage && typeof firstMessage.id === "string"
      ? firstMessage.id
      : undefined;

  if (!messageId) {
    throw new Error("Meta did not return an automatic reply ID.");
  }

  const createdAt = new Date().toISOString();

  await addOutgoingMessage({
    id: messageId,
    to,
    text: message,
    createdAt,
  });

  return messageId;
}

async function updateConversationSummary(sessionId: string) {
  const work = await getConversationSummaryWork(sessionId);

  if (!work) {
    return;
  }

  const summary = await generateConversationSummary({
    existingSummary: work.existingSummary,
    exchanges: work.exchanges,
  });

  await saveConversationSummary(work, summary);
}

export async function processAutomaticReply(
  incomingMessage: IncomingWhatsAppMessage,
) {
  if (incomingMessage.type !== "text") {
    return;
  }

  try {
    await markMessageReadAndShowTyping(incomingMessage.id).catch(
      () => undefined,
    );

    const session = await startOrContinueConversation(incomingMessage);
    const recentExchanges = await getRecentConversationExchanges(
      session.id,
      RECENT_ACTIVE_SESSION_EXCHANGES,
      incomingMessage.id,
    );
    const recentMessages = recentExchanges.flatMap<GeminiConversationMessage>(
      (exchange) => [
        {
          role: "user",
          text: exchange.userMessage,
        },
        {
          role: "model",
          text: exchange.assistantMessage,
        },
      ],
    );
    let reply: string;
    let fallbackReason: string | undefined;

    try {
      reply = await generateGeminiReply({
        userMessage: incomingMessage.text,
        activeSessionSummary: session.summary,
        recentMessages,
        getPreviousConversations: async () => {
          await markIncomingHistoryLookup(incomingMessage.id);

          return getPreviousConversationContext(
            incomingMessage.from,
            session.id,
          );
        },
        getAuthorizedVehicles: () =>
          listAuthorizedVehiclesForAgent(incomingMessage.from),
        getVehicleStatus: (identifier, identifierType) =>
          getVehicleStatusForAgent(
            incomingMessage.from,
            identifier,
            identifierType,
          ),
        searchFaq: (query) => searchFaqForAgent(query),
        onToolUse: (toolName) =>
          markIncomingAgentToolUse(
            incomingMessage.id,
            toolName,
          ).catch(() => undefined),
        waitBeforeRateLimitRetry: (delayMs) =>
          waitForGeminiRetry(incomingMessage.id, delayMs),
      });
    } catch (error) {
      reply = TEMPORARY_AI_FAILURE_REPLY;
      fallbackReason =
        error instanceof Error
          ? error.message
          : "Gemini failed unexpectedly.";
    }

    const destination = await getReplyDestination(incomingMessage.from);
    const messageId = await sendWhatsAppReply(destination, reply);

    await setIncomingAutoReplyResult(incomingMessage.id, {
      status: "sent",
      messageId,
      text: reply,
      fallbackReason,
    });

    if (!fallbackReason) {
      await updateConversationSummary(session.id).catch(() => undefined);
    }
  } catch (error) {
    await setIncomingAutoReplyResult(incomingMessage.id, {
      status: "failed",
      failureReason:
        error instanceof Error
          ? error.message
          : "The automatic reply failed unexpectedly.",
    }).catch(() => undefined);
  }
}
