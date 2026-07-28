import { getMongoDatabase } from "../mongodb.ts";

import type {
  IncidentReconciliationResult,
  MonitoringSystem,
  OfflineIncidentForNotification,
  VehicleMonitoringObservation,
} from "./types.ts";

export const OFFLINE_INCIDENT_COLLECTION_NAME = "gps_offline_incidents";

type OfflineIncidentDocument = {
  system: MonitoringSystem;
  companyName: string;
  plate: string;
  active: boolean;
  status: "pending" | "acknowledged" | "resolved";
  lastReportedAt: string;
  thresholdHours: number;
  offlineHoursAtDetection: number;
  detectedAt: string;
  lastCheckedAt: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolutionReason?: "reporting_within_threshold";
  initialNotificationId?: string;
  notificationAssignedAt?: string;
  notifiedAt?: string;
};

let incidentIndexesPromise: Promise<string[]> | null = null;

async function ensureIncidentIndexes() {
  if (!incidentIndexesPromise) {
    incidentIndexesPromise = getMongoDatabase().then((database) => {
      const collection = database.collection<OfflineIncidentDocument>(
        OFFLINE_INCIDENT_COLLECTION_NAME,
      );

      return Promise.all([
        collection.createIndex(
          { system: 1, plate: 1 },
          {
            unique: true,
            partialFilterExpression: { active: true },
          },
        ),
        collection.createIndex({ active: 1, companyName: 1 }),
      ]);
    });
  }

  await incidentIndexesPromise;
}

export async function listUnnotifiedActiveOfflineIncidents(): Promise<
  OfflineIncidentForNotification[]
> {
  await ensureIncidentIndexes();

  const database = await getMongoDatabase();
  const documents = await database
    .collection<OfflineIncidentDocument>(OFFLINE_INCIDENT_COLLECTION_NAME)
    .find({
      active: true,
      initialNotificationId: { $exists: false },
    })
    .sort({ companyName: 1, detectedAt: 1, plate: 1 })
    .toArray();

  return documents.map((document) => ({
    id: document._id.toString(),
    system: document.system,
    companyName: document.companyName,
    plate: document.plate,
    lastReportedAt: document.lastReportedAt,
  }));
}

export async function reconcileOfflineIncidents(input: {
  observations: VehicleMonitoringObservation[];
  thresholdHours: number;
  checkedAt: string;
}): Promise<IncidentReconciliationResult> {
  await ensureIncidentIndexes();

  const database = await getMongoDatabase();
  const collection = database.collection<OfflineIncidentDocument>(
    OFFLINE_INCIDENT_COLLECTION_NAME,
  );
  const offlineObservations = input.observations.filter(
    (observation) => observation.isOffline,
  );
  const reportingObservations = input.observations.filter(
    (observation) => !observation.isOffline,
  );
  let created = 0;
  let updated = 0;
  let resolved = 0;

  if (offlineObservations.length > 0) {
    const result = await collection.bulkWrite(
      offlineObservations.map((observation) => ({
        updateOne: {
          filter: {
            system: observation.system,
            plate: observation.plate,
            active: true,
          },
          update: {
            $set: {
              companyName: observation.companyName,
              lastReportedAt: observation.lastReportedAt,
              thresholdHours: input.thresholdHours,
              lastCheckedAt: input.checkedAt,
              updatedAt: input.checkedAt,
            },
            $setOnInsert: {
              active: true,
              status: "pending" as const,
              offlineHoursAtDetection: observation.offlineHours,
              detectedAt: input.checkedAt,
              createdAt: input.checkedAt,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    created = result.upsertedCount;
    updated = result.modifiedCount;
  }

  if (reportingObservations.length > 0) {
    const result = await collection.bulkWrite(
      reportingObservations.map((observation) => ({
        updateMany: {
          filter: {
            system: observation.system,
            plate: observation.plate,
            active: true,
          },
          update: {
            $set: {
              active: false,
              status: "resolved" as const,
              lastReportedAt: observation.lastReportedAt,
              thresholdHours: input.thresholdHours,
              lastCheckedAt: input.checkedAt,
              updatedAt: input.checkedAt,
              resolvedAt: input.checkedAt,
              resolutionReason: "reporting_within_threshold" as const,
            },
          },
        },
      })),
      { ordered: false },
    );

    resolved = result.modifiedCount;
  }

  return { created, updated, resolved };
}
