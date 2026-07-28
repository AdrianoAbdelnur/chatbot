import { randomUUID } from "node:crypto";

import { getMongoDatabase } from "@/lib/mongodb";
import {
  getConversationExchangeCount,
  getConversationExchangesForSummary,
  getRecentConversationExchanges,
  type IncomingWhatsAppMessage,
  setIncomingMessageSession,
} from "@/lib/whatsapp-message-store";

type WhatsAppConversationDocument = {
  _id: string;
  from: string;
  status: "active" | "closed";
  summary: string;
  summarizedExchangeCount: number;
  messageCount: number;
  startedAt: string;
  lastMessageAt: string;
  closedAt?: string;
};

export type ConversationSession = {
  id: string;
  isNew: boolean;
  summary: string;
};

export type PreviousConversationContext = {
  sessionId: string;
  summary: string;
  lastMessageAt: string;
  recentExchanges: Array<{
    userMessage: string;
    assistantMessage: string;
  }>;
};

export type ConversationSummaryWork = {
  sessionId: string;
  existingSummary: string;
  expectedSummarizedExchangeCount: number;
  exchanges: Array<{
    userMessage: string;
    assistantMessage: string;
  }>;
};

const COLLECTION_NAME = "whatsapp_conversations";
const DEFAULT_SESSION_TIMEOUT_MINUTES = 60;
const PREVIOUS_CONTEXT_DAYS = 7;
const MAX_PREVIOUS_SESSIONS = 3;
const RECENT_EXCHANGES_PER_PREVIOUS_SESSION = 4;
const SUMMARY_TRIGGER_EXCHANGES = 20;
const SUMMARY_BATCH_EXCHANGES = 10;
const RECENT_EXCHANGES_TO_KEEP = 10;
let conversationIndexesPromise: Promise<string[]> | null = null;

async function ensureConversationIndexes() {
  if (!conversationIndexesPromise) {
    conversationIndexesPromise = getMongoDatabase().then((database) => {
      const collection =
        database.collection<WhatsAppConversationDocument>(COLLECTION_NAME);

      return Promise.all([
        collection.createIndex({ from: 1, status: 1, lastMessageAt: -1 }),
        collection.createIndex({ from: 1, lastMessageAt: -1 }),
      ]);
    });
  }

  await conversationIndexesPromise;
}

function getSessionTimeoutMinutes() {
  const configuredValue = Number(
    process.env.CONVERSATION_SESSION_TIMEOUT_MINUTES ??
      DEFAULT_SESSION_TIMEOUT_MINUTES,
  );

  if (
    !Number.isInteger(configuredValue) ||
    configuredValue < 5 ||
    configuredValue > 24 * 60
  ) {
    return DEFAULT_SESSION_TIMEOUT_MINUTES;
  }

  return configuredValue;
}

export async function startOrContinueConversation(
  incomingMessage: IncomingWhatsAppMessage,
): Promise<ConversationSession> {
  await ensureConversationIndexes();
  const database = await getMongoDatabase();
  const collection =
    database.collection<WhatsAppConversationDocument>(COLLECTION_NAME);
  const now = new Date().toISOString();
  const cutoff = new Date(
    Date.now() - getSessionTimeoutMinutes() * 60_000,
  ).toISOString();
  const activeConversation = await collection.findOne(
    {
      from: incomingMessage.from,
      status: "active",
    },
    {
      sort: { lastMessageAt: -1 },
    },
  );

  if (activeConversation && activeConversation.lastMessageAt >= cutoff) {
    await Promise.all([
      collection.updateOne(
        { _id: activeConversation._id },
        {
          $set: { lastMessageAt: now },
          $inc: { messageCount: 1 },
        },
      ),
      setIncomingMessageSession(incomingMessage.id, activeConversation._id),
    ]);

    return {
      id: activeConversation._id,
      isNew: false,
      summary: activeConversation.summary,
    };
  }

  await collection.updateMany(
    {
      from: incomingMessage.from,
      status: "active",
    },
    {
      $set: {
        status: "closed",
        closedAt: now,
      },
    },
  );

  const sessionId = randomUUID();

  await Promise.all([
    collection.insertOne({
      _id: sessionId,
      from: incomingMessage.from,
      status: "active",
      summary: "",
      summarizedExchangeCount: 0,
      messageCount: 1,
      startedAt: now,
      lastMessageAt: now,
    }),
    setIncomingMessageSession(incomingMessage.id, sessionId),
  ]);

  return {
    id: sessionId,
    isNew: true,
    summary: "",
  };
}

export async function getPreviousConversationContext(
  from: string,
  currentSessionId: string,
): Promise<PreviousConversationContext[]> {
  await ensureConversationIndexes();
  const database = await getMongoDatabase();
  const collection =
    database.collection<WhatsAppConversationDocument>(COLLECTION_NAME);
  const oldestAllowedDate = new Date(
    Date.now() - PREVIOUS_CONTEXT_DAYS * 24 * 60 * 60_000,
  ).toISOString();
  const conversations = await collection
    .find({
      _id: { $ne: currentSessionId },
      from,
      lastMessageAt: { $gte: oldestAllowedDate },
    })
    .sort({ lastMessageAt: -1 })
    .limit(MAX_PREVIOUS_SESSIONS)
    .toArray();

  return Promise.all(
    conversations.map(async (conversation) => {
      const recentExchanges = await getRecentConversationExchanges(
        conversation._id,
        RECENT_EXCHANGES_PER_PREVIOUS_SESSION,
      );

      return {
        sessionId: conversation._id,
        summary: conversation.summary,
        lastMessageAt: conversation.lastMessageAt,
        recentExchanges: recentExchanges.map(
          ({ userMessage, assistantMessage }) => ({
            userMessage,
            assistantMessage,
          }),
        ),
      };
    }),
  );
}

export async function getConversationSummaryWork(
  sessionId: string,
): Promise<ConversationSummaryWork | null> {
  const database = await getMongoDatabase();
  const collection =
    database.collection<WhatsAppConversationDocument>(COLLECTION_NAME);
  const [conversation, completedExchangeCount] = await Promise.all([
    collection.findOne({ _id: sessionId }),
    getConversationExchangeCount(sessionId),
  ]);

  if (
    !conversation ||
    completedExchangeCount < SUMMARY_TRIGGER_EXCHANGES
  ) {
    return null;
  }

  const availableToSummarize =
    completedExchangeCount -
    conversation.summarizedExchangeCount -
    RECENT_EXCHANGES_TO_KEEP;

  if (availableToSummarize < SUMMARY_BATCH_EXCHANGES) {
    return null;
  }

  const batchSize = Math.min(
    SUMMARY_BATCH_EXCHANGES,
    availableToSummarize,
  );
  const exchanges = await getConversationExchangesForSummary(
    sessionId,
    conversation.summarizedExchangeCount,
    batchSize,
  );

  if (exchanges.length === 0) {
    return null;
  }

  return {
    sessionId,
    existingSummary: conversation.summary,
    expectedSummarizedExchangeCount:
      conversation.summarizedExchangeCount,
    exchanges: exchanges.map(({ userMessage, assistantMessage }) => ({
      userMessage,
      assistantMessage,
    })),
  };
}

export async function saveConversationSummary(
  work: ConversationSummaryWork,
  summary: string,
) {
  const database = await getMongoDatabase();
  const collection =
    database.collection<WhatsAppConversationDocument>(COLLECTION_NAME);

  await collection.updateOne(
    {
      _id: work.sessionId,
      summarizedExchangeCount: work.expectedSummarizedExchangeCount,
    },
    {
      $set: { summary },
      $inc: { summarizedExchangeCount: work.exchanges.length },
    },
  );
}
