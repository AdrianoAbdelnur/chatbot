import { ObjectId } from "mongodb";

import { getMongoDatabase } from "../mongodb.ts";

import { matchCustomerRepliesToNotifications } from "./customer-reply-match.ts";

import { OFFLINE_INCIDENT_COLLECTION_NAME } from "./incident-store.ts";
import { OFFLINE_NOTIFICATION_COLLECTION_NAME } from "./notification-store.ts";
import type {
  MonitoringSystem,
  OfflineBoardIncident,
  OfflineBoardNotification,
  OfflineOperationalStatus,
  OperatorActor,
} from "./types.ts";

type BoardIncidentDocument = {
  system: MonitoringSystem;
  companyName: string;
  plate: string;
  lastReportedAt: string;
  active: boolean;
  detectedAt: string;
  authorizedAt?: string;
  authorizedBy?: OperatorActor;
  initialNotificationId?: string;
  operationalStatus?: OfflineOperationalStatus;
  operatorComment?: string;
  reviewedAt?: string;
  reviewedBy?: OperatorActor;
};

type BoardNotificationDocument = {
  _id: string;
  status: OfflineBoardNotification["status"];
  failureReason?: string;
  whatsappPhone: string;
  metaMessageId?: string;
  createdAt: string;
};

type IncomingMessageDocument = {
  from: string;
  text: string;
  receivedAt: string;
  contextMessageId?: string;
};

function getWhatsappPhoneLookupValues(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (digits.startsWith("549")) {
    return [digits, `54${digits.slice(3)}`];
  }

  return digits.startsWith("54")
    ? [digits, `549${digits.slice(2)}`]
    : [digits];
}

function toBoardIncident(
  document: BoardIncidentDocument & { _id: ObjectId },
): OfflineBoardIncident {
  return {
    id: document._id.toString(),
    system: document.system,
    companyName: document.companyName,
    plate: document.plate,
    lastReportedAt: document.lastReportedAt,
    authorizedAt: document.authorizedAt,
    initialNotificationId: document.initialNotificationId,
    operationalStatus: document.operationalStatus,
    operatorComment: document.operatorComment,
    reviewedAt: document.reviewedAt,
    reviewedBy: document.reviewedBy,
  };
}

export async function listBoardIncidents(): Promise<OfflineBoardIncident[]> {
  const database = await getMongoDatabase();
  const documents = await database
    .collection<BoardIncidentDocument>(OFFLINE_INCIDENT_COLLECTION_NAME)
    .find({ active: true })
    .sort({ companyName: 1, detectedAt: 1, plate: 1 })
    .toArray();

  return documents.map(toBoardIncident);
}

export async function findActiveIncidentById(
  incidentId: string,
): Promise<OfflineBoardIncident | null> {
  if (!ObjectId.isValid(incidentId)) {
    return null;
  }

  const database = await getMongoDatabase();
  const document = await database
    .collection<BoardIncidentDocument>(OFFLINE_INCIDENT_COLLECTION_NAME)
    .findOne({
      _id: ObjectId.createFromHexString(incidentId),
      active: true,
    });

  return document ? toBoardIncident(document) : null;
}

export async function applyOperatorReview(input: {
  incidentId: string;
  operationalStatus: OfflineOperationalStatus;
  comment: string | null;
  actor: OperatorActor;
  reviewedAt: string;
}): Promise<{
  previousOperationalStatus: OfflineOperationalStatus | null;
} | null> {
  if (!ObjectId.isValid(input.incidentId)) {
    return null;
  }

  // Operator-owned fields only. `status` and `active` belong to the scanner and
  // are never written from this module.
  const setFields = {
    operationalStatus: input.operationalStatus,
    reviewedAt: input.reviewedAt,
    reviewedBy: { id: input.actor.id, name: input.actor.name },
  };
  const update =
    input.comment === null
      ? { $set: setFields, $unset: { operatorComment: "" as const } }
      : { $set: { ...setFields, operatorComment: input.comment } };

  const database = await getMongoDatabase();
  const previous = await database
    .collection<BoardIncidentDocument>(OFFLINE_INCIDENT_COLLECTION_NAME)
    .findOneAndUpdate(
      {
        _id: ObjectId.createFromHexString(input.incidentId),
        active: true,
      },
      update,
      {
        returnDocument: "before",
        projection: { operationalStatus: 1 },
      },
    );

  return previous
    ? { previousOperationalStatus: previous.operationalStatus ?? null }
    : null;
}

export async function markIncidentsAuthorized(input: {
  incidentIds: string[];
  actor: OperatorActor;
  authorizedAt: string;
}): Promise<
  {
    id: string;
    companyName: string;
    initialNotificationId?: string;
  }[]
> {
  const objectIds = input.incidentIds
    .filter((incidentId) => ObjectId.isValid(incidentId))
    .map((incidentId) => ObjectId.createFromHexString(incidentId));

  if (objectIds.length === 0) {
    return [];
  }

  const database = await getMongoDatabase();
  const collection = database.collection<BoardIncidentDocument>(
    OFFLINE_INCIDENT_COLLECTION_NAME,
  );
  const filter = { _id: { $in: objectIds }, active: true };

  // `authorizedAt` is written as an ISO string because the dispatch gate keys
  // on `{ $type: "string" }`. Writing any other type silently closes the gate.
  await collection.updateMany(filter, {
    $set: {
      authorizedAt: input.authorizedAt,
      authorizedBy: { id: input.actor.id, name: input.actor.name },
    },
  });

  const documents = await collection
    .find(filter, {
      projection: { companyName: 1, initialNotificationId: 1 },
    })
    .toArray();

  return documents.map((document) => ({
    id: document._id.toString(),
    companyName: document.companyName,
    initialNotificationId: document.initialNotificationId,
  }));
}

export async function findBoardNotificationsByIds(
  notificationIds: string[],
): Promise<Map<string, OfflineBoardNotification>> {
  if (notificationIds.length === 0) {
    return new Map();
  }

  const database = await getMongoDatabase();
  const documents = await database
    .collection<BoardNotificationDocument>(OFFLINE_NOTIFICATION_COLLECTION_NAME)
    .find(
      { _id: { $in: notificationIds } },
      {
        projection: {
          status: 1,
          failureReason: 1,
          whatsappPhone: 1,
          metaMessageId: 1,
          createdAt: 1,
        },
      },
    )
    .toArray();
  const phoneValues = [
    ...new Set(
      documents.flatMap((document) =>
        getWhatsappPhoneLookupValues(document.whatsappPhone),
      ),
    ),
  ];
  const earliestNotificationAt = documents.reduce<string | null>(
    (earliest, document) =>
      earliest === null || document.createdAt < earliest
        ? document.createdAt
        : earliest,
    null,
  );
  const messages =
    phoneValues.length > 0 && earliestNotificationAt
      ? await database
          .collection<IncomingMessageDocument>("messages")
          .find(
            {
              from: { $in: phoneValues },
              receivedAt: { $gte: earliestNotificationAt },
            },
            { projection: { from: 1, text: 1, receivedAt: 1, contextMessageId: 1 } },
          )
          .sort({ receivedAt: -1 })
          .limit(200)
          .toArray()
      : [];
  const replies = matchCustomerRepliesToNotifications(
    documents.map((document) => ({
      id: document._id,
      whatsappPhone: document.whatsappPhone,
      metaMessageId: document.metaMessageId,
      createdAt: document.createdAt,
    })),
    messages,
  );

  return new Map(
    documents.map((document) => [
      document._id,
      {
        status: document.status,
        failureReason: document.failureReason,
        customerReply: replies.get(document._id),
      },
    ]),
  );
}
