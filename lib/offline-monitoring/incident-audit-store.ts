import { getMongoDatabase } from "../mongodb.ts";

import type {
  OfflineIncidentAuditAction,
  OfflineIncidentAuditEvent,
  OfflineIncidentAuditOutcome,
  OperatorActor,
} from "./types.ts";

export const OFFLINE_INCIDENT_AUDIT_COLLECTION_NAME =
  "gps_offline_incident_events";

let incidentAuditIndexesPromise: Promise<string[]> | null = null;

async function ensureIncidentAuditIndexes() {
  if (!incidentAuditIndexesPromise) {
    incidentAuditIndexesPromise = getMongoDatabase().then((database) => {
      const collection = database.collection<OfflineIncidentAuditEvent>(
        OFFLINE_INCIDENT_AUDIT_COLLECTION_NAME,
      );

      return Promise.all([
        collection.createIndex({ incidentId: 1, createdAt: -1 }),
        collection.createIndex({ createdAt: -1 }),
      ]);
    });
  }

  await incidentAuditIndexesPromise;
}

// This module exports no update and no delete function on purpose: the
// append-only guarantee is enforced by the absent API, not by discipline.
export async function appendOfflineIncidentAuditEvent(input: {
  incidentId: string;
  action: OfflineIncidentAuditAction;
  actor: OperatorActor;
  before?: string | null;
  after?: string | null;
  outcome?: OfflineIncidentAuditOutcome;
}): Promise<void> {
  await ensureIncidentAuditIndexes();

  const database = await getMongoDatabase();

  await database
    .collection<OfflineIncidentAuditEvent>(
      OFFLINE_INCIDENT_AUDIT_COLLECTION_NAME,
    )
    .insertOne({
      incidentId: input.incidentId,
      action: input.action,
      // Snapshot by value, never a reference: renaming or removing an operator
      // must never rewrite history.
      actor: { id: input.actor.id, name: input.actor.name },
      ...(input.before === undefined ? {} : { before: input.before }),
      ...(input.after === undefined ? {} : { after: input.after }),
      ...(input.outcome ? { outcome: input.outcome } : {}),
      createdAt: new Date().toISOString(),
    });
}

export async function listOfflineIncidentAuditEvents(
  incidentId: string,
): Promise<OfflineIncidentAuditEvent[]> {
  await ensureIncidentAuditIndexes();

  const database = await getMongoDatabase();
  const documents = await database
    .collection<OfflineIncidentAuditEvent>(
      OFFLINE_INCIDENT_AUDIT_COLLECTION_NAME,
    )
    .find({ incidentId })
    .sort({ createdAt: -1 })
    .toArray();

  return documents.map((document) => ({
    incidentId: document.incidentId,
    action: document.action,
    actor: document.actor,
    before: document.before,
    after: document.after,
    outcome: document.outcome,
    createdAt: document.createdAt,
  }));
}
