import { getAutomaticReplyMetaFailureReason } from "./whatsapp-meta-error.ts";

const PDF_MIME_TYPE = "application/pdf";
const UPLOAD_TIMEOUT_MS = 30_000;
const SEND_TIMEOUT_MS = 15_000;

export type WhatsAppMediaConfig = {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
};

type MetaMediaUploadResponse = {
  id?: unknown;
};

type MetaSendResponse = {
  messages?: Array<{
    id?: unknown;
  }>;
};

export function getWhatsAppMediaConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WhatsAppMediaConfig {
  const accessToken = environment.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = environment.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = environment.WHATSAPP_API_VERSION || "v25.0";

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API is not configured.");
  }

  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    throw new Error("WHATSAPP_API_VERSION has an invalid format.");
  }

  return { accessToken, phoneNumberId, apiVersion };
}

function buildGraphUrl(config: WhatsAppMediaConfig, resource: string) {
  return `https://graph.facebook.com/${config.apiVersion}/${encodeURIComponent(config.phoneNumberId)}/${resource}`;
}

/**
 * Uploads the certificate to Meta and returns its media ID. Uploading keeps
 * the document off any public URL: only this WhatsApp number can attach it.
 */
export async function uploadWhatsAppDocument(
  input: {
    bytes: Uint8Array;
    filename: string;
  },
  config: WhatsAppMediaConfig,
  fetchImplementation: typeof fetch = fetch,
) {
  const form = new FormData();
  // Copy into a plain ArrayBuffer: a typed array view is not a valid BlobPart.
  const fileBuffer = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength,
  ) as ArrayBuffer;

  form.append("messaging_product", "whatsapp");
  form.append("type", PDF_MIME_TYPE);
  form.append(
    "file",
    new Blob([fileBuffer], { type: PDF_MIME_TYPE }),
    input.filename,
  );

  const response = await fetchImplementation(
    buildGraphUrl(config, "media"),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}` },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    },
  );
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      getAutomaticReplyMetaFailureReason(payload, config.accessToken),
    );
  }

  const mediaId = (payload as MetaMediaUploadResponse | null)?.id;

  if (typeof mediaId !== "string" || !mediaId) {
    throw new Error("Meta did not return a media ID for the document.");
  }

  return mediaId;
}

export async function sendWhatsAppDocument(
  input: {
    to: string;
    mediaId: string;
    filename: string;
    caption?: string;
  },
  config: WhatsAppMediaConfig,
  fetchImplementation: typeof fetch = fetch,
) {
  const response = await fetchImplementation(
    buildGraphUrl(config, "messages"),
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
        type: "document",
        document: {
          id: input.mediaId,
          filename: input.filename,
          ...(input.caption ? { caption: input.caption } : {}),
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    },
  );
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      getAutomaticReplyMetaFailureReason(payload, config.accessToken),
    );
  }

  const messageId = (payload as MetaSendResponse | null)?.messages?.[0]?.id;

  if (typeof messageId !== "string" || !messageId) {
    throw new Error("Meta did not return an ID for the sent document.");
  }

  return messageId;
}
