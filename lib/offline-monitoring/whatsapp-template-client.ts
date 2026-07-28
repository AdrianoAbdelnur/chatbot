type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type MetaTemplateSuccess = {
  messages?: Array<{
    id?: unknown;
  }>;
};

type MetaTemplateError = {
  error?: {
    message?: unknown;
    code?: unknown;
    error_subcode?: unknown;
  };
};

export type OfflineTemplateIdentity = {
  name: string;
  language: string;
};

export type OfflineTemplateConfig = OfflineTemplateIdentity & {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
};

export class OfflineTemplateRejectedError extends Error {
  readonly retrySafe = true;
}

export function getOfflineTemplateIdentity(
  environment: NodeJS.ProcessEnv = process.env,
): OfflineTemplateIdentity {
  const name =
    environment.WHATSAPP_OFFLINE_TEMPLATE_NAME ??
    "vehicle_offline_followup";
  const language =
    environment.WHATSAPP_OFFLINE_TEMPLATE_LANGUAGE ?? "es_AR";

  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error("WHATSAPP_OFFLINE_TEMPLATE_NAME is invalid.");
  }

  if (!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)) {
    throw new Error("WHATSAPP_OFFLINE_TEMPLATE_LANGUAGE is invalid.");
  }

  return { name, language };
}

export function getOfflineTemplateConfig(
  environment: NodeJS.ProcessEnv = process.env,
): OfflineTemplateConfig {
  const identity = getOfflineTemplateIdentity(environment);
  const accessToken = environment.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = environment.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = environment.WHATSAPP_API_VERSION ?? "v25.0";

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API is not configured.");
  }

  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    throw new Error("WHATSAPP_API_VERSION is invalid.");
  }

  return {
    ...identity,
    accessToken,
    phoneNumberId,
    apiVersion,
  };
}

function getMetaFailureReason(payload: unknown, accessToken: string) {
  const error =
    payload && typeof payload === "object"
      ? (payload as MetaTemplateError).error
      : undefined;
  const message =
    error && typeof error.message === "string"
      ? error.message.replaceAll(accessToken, "[redacted]")
      : "Meta rejected the offline notification template.";
  const codes = [
    typeof error?.code === "number" ? `code=${error.code}` : null,
    typeof error?.error_subcode === "number"
      ? `subcode=${error.error_subcode}`
      : null,
  ].filter((value): value is string => value !== null);

  return `${message}${codes.length > 0 ? ` (${codes.join(", ")})` : ""}`;
}

export async function sendOfflineNotificationTemplate(
  input: {
    to: string;
    contactName: string;
    vehicleCount: number;
    vehicleList: string;
  },
  config: OfflineTemplateConfig = getOfflineTemplateConfig(),
  fetchImplementation: FetchImplementation = fetch,
) {
  const response = await fetchImplementation(
    `https://graph.facebook.com/${config.apiVersion}/${encodeURIComponent(config.phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: "template",
        template: {
          name: config.name,
          language: { code: config.language },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: input.contactName },
                { type: "text", text: String(input.vehicleCount) },
                { type: "text", text: input.vehicleList },
              ],
            },
          ],
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new OfflineTemplateRejectedError(
      getMetaFailureReason(payload, config.accessToken),
    );
  }

  const firstMessage =
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as MetaTemplateSuccess).messages)
      ? (payload as MetaTemplateSuccess).messages?.[0]
      : undefined;
  const messageId =
    firstMessage && typeof firstMessage.id === "string"
      ? firstMessage.id
      : undefined;

  if (!messageId) {
    throw new Error("Meta accepted the template without returning a message ID.");
  }

  return messageId;
}
