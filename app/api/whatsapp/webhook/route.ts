import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";

import { processAutomaticReply } from "@/lib/whatsapp-auto-reply";
import {
  addIncomingMessages,
  type WhatsAppStatusUpdate,
  updateOutgoingMessageStatuses,
} from "@/lib/whatsapp-message-store";
import { parseIncomingMessages } from "@/lib/whatsapp-webhook-parser";

export const runtime = "nodejs";
export const maxDuration = 180;

type WhatsAppWebhookValue = {
  statuses?: unknown;
};

type WhatsAppWebhookPayload = {
  object?: unknown;
  entry?: unknown;
};

type WhatsAppWebhookStatus = {
  errors?: unknown;
  id?: unknown;
  recipient_id?: unknown;
  status?: unknown;
  timestamp?: unknown;
};

type WhatsAppWebhookError = {
  error_data?: {
    details?: unknown;
  };
  message?: unknown;
  title?: unknown;
};

const DELIVERY_STATUSES = new Set(["sent", "delivered", "read", "failed"]);

function safeCompare(valueA: string, valueB: string) {
  const bufferA = Buffer.from(valueA);
  const bufferB = Buffer.from(valueB);

  return (
    bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB)
  );
}

function hasValidSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
) {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const receivedSignature = signatureHeader.slice("sha256=".length);
  const expectedSignature = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  return safeCompare(receivedSignature, expectedSignature);
}

function getStatusFailureReason(status: WhatsAppWebhookStatus) {
  if (!Array.isArray(status.errors) || status.errors.length === 0) {
    return undefined;
  }

  const error = status.errors[0] as WhatsAppWebhookError;

  if (typeof error.title === "string") {
    return error.title;
  }

  if (typeof error.message === "string") {
    return error.message;
  }

  return error.error_data &&
    typeof error.error_data.details === "string"
    ? error.error_data.details
    : undefined;
}

function parseStatusUpdates(payload: unknown): WhatsAppStatusUpdate[] {
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

  const statusUpdates: WhatsAppStatusUpdate[] = [];

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

      const statuses = (value as WhatsAppWebhookValue).statuses;

      if (!Array.isArray(statuses)) {
        continue;
      }

      for (const rawStatus of statuses) {
        if (!rawStatus || typeof rawStatus !== "object") {
          continue;
        }

        const status = rawStatus as WhatsAppWebhookStatus;

        if (
          typeof status.id !== "string" ||
          typeof status.status !== "string" ||
          !DELIVERY_STATUSES.has(status.status)
        ) {
          continue;
        }

        const unixTimestamp =
          typeof status.timestamp === "string"
            ? Number(status.timestamp)
            : Number.NaN;

        statusUpdates.push({
          id: status.id,
          status: status.status as WhatsAppStatusUpdate["status"],
          recipientId:
            typeof status.recipient_id === "string"
              ? status.recipient_id
              : undefined,
          statusTimestamp: Number.isFinite(unixTimestamp)
            ? new Date(unixTimestamp * 1000).toISOString()
            : new Date().toISOString(),
          failureReason: getStatusFailureReason(status),
        });
      }
    }
  }

  return statusUpdates;
}

export async function GET(request: Request) {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    return new Response("Webhook verification is not configured.", {
      status: 500,
    });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    challenge &&
    safeCompare(token, verifyToken)
  ) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  return new Response("Webhook verification failed.", { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;

  if (!appSecret) {
    return Response.json(
      {
        success: false,
        error: "Webhook signature validation is not configured.",
      },
      { status: 500 },
    );
  }

  const rawBody = await request.text();

  if (
    !hasValidSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      appSecret,
    )
  ) {
    return Response.json(
      { success: false, error: "Invalid webhook signature." },
      { status: 401 },
    );
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return Response.json(
      { success: false, error: "Invalid webhook payload." },
      { status: 400 },
    );
  }

  try {
    const [newIncomingMessages] = await Promise.all([
      addIncomingMessages(parseIncomingMessages(payload)),
      updateOutgoingMessageStatuses(parseStatusUpdates(payload)),
    ]);

    if (newIncomingMessages.length > 0) {
      after(async () => {
        for (const incomingMessage of newIncomingMessages) {
          await processAutomaticReply(incomingMessage);
        }
      });
    }
  } catch {
    return Response.json(
      { success: false, error: "Unable to store webhook messages." },
      { status: 500 },
    );
  }

  return Response.json({ success: true });
}
