import { addOutgoingMessage } from "@/lib/whatsapp-message-store";

type SendMessageRequest = {
  to?: unknown;
  message?: unknown;
};

type MetaErrorResponse = {
  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
    error_subcode?: unknown;
  };
};

type MetaSuccessResponse = {
  messages?: Array<{
    id?: unknown;
  }>;
};

const PHONE_MIN_LENGTH = 8;
const PHONE_MAX_LENGTH = 15;
const MESSAGE_MAX_LENGTH = 4096;

function normalizePhoneNumber(phone: string) {
  return phone.replace(/[+\s\-()]/g, "");
}

function getMetaError(payload: unknown, accessToken: string) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const error = (payload as MetaErrorResponse).error;

  if (!error || typeof error !== "object") {
    return null;
  }

  return {
    message:
      typeof error.message === "string"
        ? error.message.replaceAll(accessToken, "[redacted]")
        : "Meta rejected the message.",
    type: typeof error.type === "string" ? error.type : undefined,
    code: typeof error.code === "number" ? error.code : undefined,
    errorSubcode:
      typeof error.error_subcode === "number" ? error.error_subcode : undefined,
  };
}

export async function POST(request: Request) {
  let body: SendMessageRequest;

  try {
    body = (await request.json()) as SendMessageRequest;
  } catch {
    return Response.json(
      { success: false, error: "The request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { success: false, error: "The request body must be a JSON object." },
      { status: 400 },
    );
  }

  if (typeof body.to !== "string" || typeof body.message !== "string") {
    return Response.json(
      {
        success: false,
        error: 'Both "to" and "message" must be strings.',
      },
      { status: 400 },
    );
  }

  const to = normalizePhoneNumber(body.to.trim());
  const message = body.message.trim();

  if (
    !/^\d+$/.test(to) ||
    to.length < PHONE_MIN_LENGTH ||
    to.length > PHONE_MAX_LENGTH
  ) {
    return Response.json(
      {
        success: false,
        error:
          "The phone number must include the country code and contain 8 to 15 digits.",
      },
      { status: 400 },
    );
  }

  if (!message) {
    return Response.json(
      { success: false, error: "The message cannot be empty." },
      { status: 400 },
    );
  }

  if (message.length > MESSAGE_MAX_LENGTH) {
    return Response.json(
      {
        success: false,
        error: `The message cannot exceed ${MESSAGE_MAX_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v25.0";

  if (!accessToken || !phoneNumberId) {
    return Response.json(
      {
        success: false,
        error:
          "WhatsApp Cloud API is not configured on the server. Check the environment variables.",
      },
      { status: 500 },
    );
  }

  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    return Response.json(
      {
        success: false,
        error: "WHATSAPP_API_VERSION has an invalid format.",
      },
      { status: 500 },
    );
  }

  try {
    const metaResponse = await fetch(
      `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
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
      },
    );

    const metaPayload: unknown = await metaResponse.json().catch(() => null);

    if (!metaResponse.ok) {
      const metaError = getMetaError(metaPayload, accessToken);

      return Response.json(
        {
          success: false,
          error: metaError?.message ?? "Meta could not send the message.",
          meta: metaError
            ? {
                type: metaError.type,
                code: metaError.code,
                errorSubcode: metaError.errorSubcode,
              }
            : undefined,
        },
        { status: 502 },
      );
    }

    const firstMessage =
      metaPayload &&
      typeof metaPayload === "object" &&
      Array.isArray((metaPayload as MetaSuccessResponse).messages)
        ? (metaPayload as MetaSuccessResponse).messages?.[0]
        : undefined;
    const messageId =
      firstMessage && typeof firstMessage.id === "string"
        ? firstMessage.id
        : undefined;

    let trackingAvailable = Boolean(messageId);

    if (messageId) {
      try {
        await addOutgoingMessage({
          id: messageId,
          to,
          text: message,
          createdAt: new Date().toISOString(),
        });
      } catch {
        trackingAvailable = false;
      }
    }

    return Response.json({
      success: true,
      status: "accepted",
      message: trackingAvailable
        ? "Meta accepted the message. Waiting for delivery updates."
        : "Meta accepted the message, but delivery tracking is unavailable.",
      messageId,
      trackingAvailable,
    });
  } catch {
    return Response.json(
      {
        success: false,
        error: "The server could not connect to Meta. Please try again.",
      },
      { status: 502 },
    );
  }
}
