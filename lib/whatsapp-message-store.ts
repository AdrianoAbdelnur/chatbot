import { getMongoDatabase } from "./mongodb.ts";

export type IncomingWhatsAppMessage = {
  id: string;
  from: string;
  profileName?: string;
  type: string;
  text: string;
  receivedAt: string;
  interactiveReplyId?: string;
  contextMessageId?: string;
};

export type WhatsAppDeliveryStatus =
  | "accepted"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type OutgoingWhatsAppMessage = {
  id: string;
  to: string;
  text: string;
  status: WhatsAppDeliveryStatus;
  createdAt: string;
  updatedAt: string;
  statusTimestamp?: string;
  failureReason?: string;
};

export type WhatsAppStatusUpdate = {
  id: string;
  status: Exclude<WhatsAppDeliveryStatus, "accepted">;
  recipientId?: string;
  statusTimestamp: string;
  failureReason?: string;
};

export type ConversationExchange = {
  userMessage: string;
  assistantMessage: string;
  receivedAt: string;
};

type IncomingWhatsAppMessageDocument = IncomingWhatsAppMessage & {
  _id: string;
  sessionId?: string;
  autoReplyStatus?: "sent" | "failed";
  autoReplyMessageId?: string;
  autoReplyText?: string;
  autoReplyUpdatedAt?: string;
  autoReplyFailureReason?: string;
  autoReplyFallbackUsed?: boolean;
  historyLookupUsed?: boolean;
  historyLookupAt?: string;
  agentToolUses?: Array<{
    name: string;
    usedAt: string;
  }>;
  handoffStatus?: "offered" | "processing" | "completed";
  handoffReason?: string;
  handoffSummary?: string;
  handoffUpdatedAt?: string;
};

type OutgoingWhatsAppMessageDocument = {
  _id: string;
  id: string;
  to?: string;
  text?: string;
  status: WhatsAppDeliveryStatus;
  createdAt: string;
  updatedAt: string;
  statusTimestamp?: string;
  recipientId?: string;
  failureReason?: string;
};

const MAX_MESSAGES = 100;
const MAX_OUTGOING_MESSAGES = 20;
const INCOMING_COLLECTION_NAME = "messages";
const OUTGOING_COLLECTION_NAME = "outgoing_messages";
let messageSessionIndexPromise: Promise<string> | null = null;

async function ensureMessageSessionIndex() {
  if (!messageSessionIndexPromise) {
    messageSessionIndexPromise = getMongoDatabase().then((database) =>
      database
        .collection<IncomingWhatsAppMessageDocument>(INCOMING_COLLECTION_NAME)
        .createIndex({ sessionId: 1, receivedAt: 1 }),
    );
  }

  await messageSessionIndexPromise;
}

export async function addIncomingMessages(
  messages: IncomingWhatsAppMessage[],
) {
  if (messages.length === 0) {
    return [];
  }

  const database = await getMongoDatabase();
  const collection = database.collection<IncomingWhatsAppMessageDocument>(
    INCOMING_COLLECTION_NAME,
  );

  const result = await collection.bulkWrite(
    messages.map((message) => ({
      updateOne: {
        filter: { _id: message.id },
        update: {
          $setOnInsert: {
            _id: message.id,
            ...message,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );

  const insertedIndexes = new Set(
    Object.keys(result.upsertedIds).map((index) => Number(index)),
  );

  return messages.filter((_message, index) => insertedIndexes.has(index));
}

export async function setIncomingAutoReplyResult(
  incomingMessageId: string,
  result:
    | {
        status: "sent";
        messageId: string;
        text: string;
        fallbackReason?: string;
        handoffOffer?: {
          reason: string;
          summary: string;
        };
      }
    | {
        status: "failed";
        failureReason: string;
      },
) {
  const database = await getMongoDatabase();
  const collection = database.collection<IncomingWhatsAppMessageDocument>(
    INCOMING_COLLECTION_NAME,
  );

  await collection.updateOne(
    { _id: incomingMessageId },
    {
      $set: {
        autoReplyStatus: result.status,
        autoReplyUpdatedAt: new Date().toISOString(),
        ...(result.status === "sent"
          ? {
              autoReplyMessageId: result.messageId,
              autoReplyText: result.text,
              autoReplyFallbackUsed: Boolean(result.fallbackReason),
              ...(result.handoffOffer
                ? {
                    handoffStatus: "offered" as const,
                    handoffReason: result.handoffOffer.reason,
                    handoffSummary: result.handoffOffer.summary,
                    handoffUpdatedAt: new Date().toISOString(),
                  }
                : {}),
              ...(result.fallbackReason
                ? { autoReplyFailureReason: result.fallbackReason }
                : {}),
            }
          : {
              autoReplyFailureReason: result.failureReason,
            }),
      },
      ...(result.status === "sent"
        ? result.fallbackReason
          ? {}
          : { $unset: { autoReplyFailureReason: "" } }
        : {}),
    },
  );
}

export async function claimHumanHandoffOffer(
  from: string,
  offerMessageId?: string,
) {
  const database = await getMongoDatabase();
  const collection = database.collection<IncomingWhatsAppMessageDocument>(
    INCOMING_COLLECTION_NAME,
  );
  const offer = await collection.findOne(
    {
      from,
      handoffStatus: "offered",
      handoffSummary: { $type: "string" },
      ...(offerMessageId ? { autoReplyMessageId: offerMessageId } : {}),
    },
    {
      sort: { receivedAt: -1 },
    },
  );

  if (!offer || typeof offer.handoffSummary !== "string") {
    return null;
  }

  const result = await collection.updateOne(
    {
      _id: offer._id,
      handoffStatus: "offered",
    },
    {
      $set: {
        handoffStatus: "processing",
        handoffUpdatedAt: new Date().toISOString(),
      },
    },
  );

  if (result.modifiedCount !== 1) {
    return null;
  }

  return {
    incomingMessageId: offer._id,
    summary: offer.handoffSummary,
  };
}

export async function completeHumanHandoffOffer(incomingMessageId: string) {
  const database = await getMongoDatabase();
  const collection = database.collection<IncomingWhatsAppMessageDocument>(
    INCOMING_COLLECTION_NAME,
  );

  await collection.updateOne(
    {
      _id: incomingMessageId,
      handoffStatus: "processing",
    },
    {
      $set: {
        handoffStatus: "completed",
        handoffUpdatedAt: new Date().toISOString(),
      },
    },
  );
}

export async function releaseHumanHandoffOffer(incomingMessageId: string) {
  const database = await getMongoDatabase();
  const collection = database.collection<IncomingWhatsAppMessageDocument>(
    INCOMING_COLLECTION_NAME,
  );

  await collection.updateOne(
    {
      _id: incomingMessageId,
      handoffStatus: "processing",
    },
    {
      $set: {
        handoffStatus: "offered",
        handoffUpdatedAt: new Date().toISOString(),
      },
    },
  );
}

export async function setIncomingMessageSession(
  incomingMessageId: string,
  sessionId: string,
) {
  const database = await getMongoDatabase();
  const collection = database.collection<IncomingWhatsAppMessageDocument>(
    INCOMING_COLLECTION_NAME,
  );

  await collection.updateOne(
    { _id: incomingMessageId },
    {
      $set: {
        sessionId,
      },
    },
  );
}

export async function markIncomingHistoryLookup(incomingMessageId: string) {
  const database = await getMongoDatabase();
  const collection = database.collection<IncomingWhatsAppMessageDocument>(
    INCOMING_COLLECTION_NAME,
  );

  await collection.updateOne(
    { _id: incomingMessageId },
    {
      $set: {
        historyLookupUsed: true,
        historyLookupAt: new Date().toISOString(),
      },
    },
  );
}

export async function markIncomingAgentToolUse(
  incomingMessageId: string,
  toolName: string,
) {
  const database = await getMongoDatabase();
  const collection = database.collection<IncomingWhatsAppMessageDocument>(
    INCOMING_COLLECTION_NAME,
  );

  await collection.updateOne(
    { _id: incomingMessageId },
    {
      $push: {
        agentToolUses: {
          name: toolName.slice(0, 100),
          usedAt: new Date().toISOString(),
        },
      },
    },
  );
}

function toConversationExchange(
  document: IncomingWhatsAppMessageDocument,
): ConversationExchange | null {
  if (
    document.autoReplyStatus !== "sent" ||
    document.autoReplyFallbackUsed === true ||
    typeof document.autoReplyText !== "string"
  ) {
    return null;
  }

  return {
    userMessage: document.text,
    assistantMessage: document.autoReplyText,
    receivedAt: document.receivedAt,
  };
}

export async function getRecentConversationExchanges(
  sessionId: string,
  limit: number,
  excludeIncomingMessageId?: string,
) {
  await ensureMessageSessionIndex();
  const database = await getMongoDatabase();
  const collection = database.collection<IncomingWhatsAppMessageDocument>(
    INCOMING_COLLECTION_NAME,
  );
  const documents = await collection
    .find({
      sessionId,
      autoReplyStatus: "sent",
      autoReplyFallbackUsed: { $ne: true },
      autoReplyText: { $type: "string" },
      ...(excludeIncomingMessageId
        ? { _id: { $ne: excludeIncomingMessageId } }
        : {}),
    })
    .sort({ receivedAt: -1 })
    .limit(limit)
    .toArray();

  return documents
    .reverse()
    .map(toConversationExchange)
    .filter((exchange): exchange is ConversationExchange => exchange !== null);
}

export async function getConversationExchangeCount(sessionId: string) {
  await ensureMessageSessionIndex();
  const database = await getMongoDatabase();
  const collection = database.collection<IncomingWhatsAppMessageDocument>(
    INCOMING_COLLECTION_NAME,
  );

  return collection.countDocuments({
    sessionId,
    autoReplyStatus: "sent",
    autoReplyFallbackUsed: { $ne: true },
    autoReplyText: { $type: "string" },
  });
}

export async function getConversationExchangesForSummary(
  sessionId: string,
  skip: number,
  limit: number,
) {
  await ensureMessageSessionIndex();
  const database = await getMongoDatabase();
  const collection = database.collection<IncomingWhatsAppMessageDocument>(
    INCOMING_COLLECTION_NAME,
  );
  const documents = await collection
    .find({
      sessionId,
      autoReplyStatus: "sent",
      autoReplyFallbackUsed: { $ne: true },
      autoReplyText: { $type: "string" },
    })
    .sort({ receivedAt: 1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  return documents
    .map(toConversationExchange)
    .filter((exchange): exchange is ConversationExchange => exchange !== null);
}

export async function addOutgoingMessage(message: {
  id: string;
  to: string;
  text: string;
  createdAt: string;
}) {
  const database = await getMongoDatabase();
  const collection = database.collection<OutgoingWhatsAppMessageDocument>(
    OUTGOING_COLLECTION_NAME,
  );

  await collection.updateOne(
    { _id: message.id },
    {
      $set: {
        id: message.id,
        to: message.to,
        text: message.text,
      },
      $setOnInsert: {
        status: "accepted",
        createdAt: message.createdAt,
        updatedAt: message.createdAt,
      },
    },
    { upsert: true },
  );
}

export async function getReplyDestination(whatsAppId: string) {
  const database = await getMongoDatabase();
  const collection = database.collection<OutgoingWhatsAppMessageDocument>(
    OUTGOING_COLLECTION_NAME,
  );
  const previousMessage = await collection.findOne(
    {
      recipientId: whatsAppId,
      to: { $type: "string" },
    },
    {
      sort: { updatedAt: -1 },
    },
  );

  return previousMessage?.to ?? whatsAppId;
}

export async function updateOutgoingMessageStatuses(
  statuses: WhatsAppStatusUpdate[],
) {
  if (statuses.length === 0) {
    return;
  }

  const database = await getMongoDatabase();
  const collection = database.collection<OutgoingWhatsAppMessageDocument>(
    OUTGOING_COLLECTION_NAME,
  );

  await collection.bulkWrite(
    statuses.map((status) => ({
      updateOne: {
        filter: { _id: status.id },
        update: {
          $set: {
            id: status.id,
            status: status.status,
            updatedAt: status.statusTimestamp,
            statusTimestamp: status.statusTimestamp,
            ...(status.recipientId
              ? { recipientId: status.recipientId }
              : {}),
            ...(status.failureReason
              ? { failureReason: status.failureReason }
              : {}),
          },
          $setOnInsert: {
            createdAt: status.statusTimestamp,
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

export async function getIncomingMessages() {
  const database = await getMongoDatabase();
  const collection = database.collection<IncomingWhatsAppMessageDocument>(
    INCOMING_COLLECTION_NAME,
  );
  const documents = await collection
    .find({})
    .sort({ receivedAt: -1 })
    .limit(MAX_MESSAGES)
    .toArray();

  return documents.reverse().map((document) => ({
    id: document.id,
    from: document.from,
    profileName: document.profileName,
    type: document.type,
    text: document.text,
    receivedAt: document.receivedAt,
  }));
}

export async function getOutgoingMessages(): Promise<
  OutgoingWhatsAppMessage[]
> {
  const database = await getMongoDatabase();
  const collection = database.collection<OutgoingWhatsAppMessageDocument>(
    OUTGOING_COLLECTION_NAME,
  );
  const documents = await collection
    .find({})
    .sort({ createdAt: -1 })
    .limit(MAX_OUTGOING_MESSAGES)
    .toArray();

  return documents.map((document) => ({
    id: document.id,
    to: document.to ?? document.recipientId ?? "unknown",
    text: document.text ?? "Message details unavailable",
    status: document.status,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    statusTimestamp: document.statusTimestamp,
    failureReason: document.failureReason,
  }));
}
