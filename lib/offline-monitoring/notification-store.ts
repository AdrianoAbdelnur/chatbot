import { createHash } from "node:crypto";

import { MongoServerError, ObjectId } from "mongodb";

import { getMongoDatabase } from "../mongodb.ts";

import { OFFLINE_INCIDENT_COLLECTION_NAME } from "./incident-store.ts";
import type {
  MonitoringSystem,
  OfflineNotificationPreview,
} from "./types.ts";

export const OFFLINE_NOTIFICATION_COLLECTION_NAME =
  "gps_offline_notifications";

type OfflineNotificationStatus =
  | "pending"
  | "accepted"
  | "failed"
  | "cancelled";

type OfflineNotificationDocument = {
  _id: string;
  system: MonitoringSystem;
  companyName: string;
  contactName: string;
  whatsappPhone: string;
  incidentIds: string[];
  templateName: string;
  templateLanguage: string;
  templateParameters: [string, string, string];
  renderedText: string;
  status: OfflineNotificationStatus;
  createdAt: string;
  updatedAt: string;
  metaMessageId?: string;
  failureReason?: string;
  retryable?: boolean;
};

function buildNotificationId(preview: OfflineNotificationPreview) {
  const source = [preview.system, ...[...preview.incidentIds].sort()].join(":");
  const digest = createHash("sha256").update(source).digest("hex");
  return `offline:${digest}`;
}

export async function reserveOfflineNotification(input: {
  preview: OfflineNotificationPreview;
  templateName: string;
  templateLanguage: string;
}) {
  const notificationId = buildNotificationId(input.preview);
  const now = new Date().toISOString();
  const database = await getMongoDatabase();
  const notificationCollection =
    database.collection<OfflineNotificationDocument>(
      OFFLINE_NOTIFICATION_COLLECTION_NAME,
    );

  try {
    await notificationCollection.insertOne({
      _id: notificationId,
      system: input.preview.system,
      companyName: input.preview.companyName,
      contactName: input.preview.contactName,
      whatsappPhone: input.preview.whatsappPhone,
      incidentIds: input.preview.incidentIds,
      templateName: input.templateName,
      templateLanguage: input.templateLanguage,
      templateParameters: [
        input.preview.contactName,
        String(input.preview.vehicleCount),
        input.preview.vehicleList,
      ],
      renderedText: input.preview.renderedText,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11_000) {
      const retryResult = await notificationCollection.updateOne(
        {
          _id: notificationId,
          status: "failed",
          retryable: true,
        },
        {
          $set: {
            system: input.preview.system,
            companyName: input.preview.companyName,
            contactName: input.preview.contactName,
            whatsappPhone: input.preview.whatsappPhone,
            incidentIds: input.preview.incidentIds,
            templateName: input.templateName,
            templateLanguage: input.templateLanguage,
            templateParameters: [
              input.preview.contactName,
              String(input.preview.vehicleCount),
              input.preview.vehicleList,
            ],
            renderedText: input.preview.renderedText,
            status: "pending",
            updatedAt: now,
          },
          $unset: {
            failureReason: "",
            retryable: "",
          },
        },
      );

      if (retryResult.matchedCount !== 1) {
        return null;
      }
    } else {
      throw error;
    }
  }

  const incidentIds = input.preview.incidentIds.map((id) =>
    ObjectId.createFromHexString(id),
  );
  const incidentResult = await database
    .collection(OFFLINE_INCIDENT_COLLECTION_NAME)
    .updateMany(
      {
        _id: { $in: incidentIds },
        active: true,
        $or: [
          { initialNotificationId: { $exists: false } },
          { initialNotificationId: notificationId },
        ],
      },
      {
        $set: {
          initialNotificationId: notificationId,
          notificationAssignedAt: now,
          updatedAt: now,
        },
      },
    );

  if (incidentResult.matchedCount !== incidentIds.length) {
    await Promise.all([
      database.collection(OFFLINE_INCIDENT_COLLECTION_NAME).updateMany(
        { initialNotificationId: notificationId },
        {
          $unset: {
            initialNotificationId: "",
            notificationAssignedAt: "",
          },
          $set: { updatedAt: now },
        },
      ),
      notificationCollection.updateOne(
        { _id: notificationId },
        {
          $set: {
            status: "cancelled",
            updatedAt: now,
            failureReason:
              "One or more incidents were already assigned to another notification.",
          },
        },
      ),
    ]);

    return null;
  }

  return notificationId;
}

export async function markOfflineNotificationAccepted(input: {
  notificationId: string;
  incidentIds: string[];
  metaMessageId: string;
}) {
  const now = new Date().toISOString();
  const database = await getMongoDatabase();
  const incidentIds = input.incidentIds.map((id) =>
    ObjectId.createFromHexString(id),
  );

  await Promise.all([
    database
      .collection<OfflineNotificationDocument>(
        OFFLINE_NOTIFICATION_COLLECTION_NAME,
      )
      .updateOne(
        { _id: input.notificationId },
        {
          $set: {
            status: "accepted",
            metaMessageId: input.metaMessageId,
            updatedAt: now,
          },
          $unset: { failureReason: "" },
        },
      ),
    database.collection(OFFLINE_INCIDENT_COLLECTION_NAME).updateMany(
      {
        _id: { $in: incidentIds },
        initialNotificationId: input.notificationId,
      },
      {
        $set: {
          notifiedAt: now,
          updatedAt: now,
        },
      },
    ),
  ]);
}

export async function markOfflineNotificationFailed(
  notificationId: string,
  failureReason: string,
  options: { releaseForRetry?: boolean } = {},
) {
  const database = await getMongoDatabase();
  const notificationCollection =
    database.collection<OfflineNotificationDocument>(
      OFFLINE_NOTIFICATION_COLLECTION_NAME,
    );

  if (!options.releaseForRetry) {
    await notificationCollection.updateOne(
      { _id: notificationId },
      {
        $set: {
          status: "failed",
          failureReason: failureReason.slice(0, 1_000),
          retryable: false,
          updatedAt: new Date().toISOString(),
        },
      },
    );
    return;
  }

  const session = database.client.startSession();

  try {
    await session.withTransaction(async () => {
      const notification = await notificationCollection.findOne(
        { _id: notificationId, status: "pending" },
        {
          projection: { incidentIds: 1 },
          session,
        },
      );

      if (!notification) {
        return;
      }

      const incidentIds = notification.incidentIds.map((id) =>
        ObjectId.createFromHexString(id),
      );
      const incidentResult = await database
        .collection(OFFLINE_INCIDENT_COLLECTION_NAME)
        .updateMany(
          {
            _id: { $in: incidentIds },
            initialNotificationId: notificationId,
          },
          {
            $unset: {
              initialNotificationId: "",
              notificationAssignedAt: "",
            },
            $set: { updatedAt: new Date().toISOString() },
          },
          { session },
        );

      if (incidentResult.matchedCount !== incidentIds.length) {
        throw new Error(
          "The failed notification incident assignments could not be released.",
        );
      }

      const notificationResult = await notificationCollection.updateOne(
        { _id: notificationId, status: "pending" },
        {
          $set: {
            status: "failed",
            failureReason: failureReason.slice(0, 1_000),
            retryable: true,
            updatedAt: new Date().toISOString(),
          },
        },
        { session },
      );

      if (notificationResult.matchedCount !== 1) {
        throw new Error(
          "The failed notification reservation could not be marked retryable.",
        );
      }
    });
  } finally {
    await session.endSession();
  }
}
