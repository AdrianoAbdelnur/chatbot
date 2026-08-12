import { timingSafeEqual } from "node:crypto";

import { runRegistryBackedDailyJob } from "../../../../lib/offline-monitoring/daily-job.ts";
import { getCybermapaVehicleReports, getCybermapaVehicles } from "../../../../lib/cybermapa/services.ts";
import { getMongoDatabase } from "../../../../lib/mongodb.ts";
import { createCatalogService } from "../../../../lib/offline-monitoring/catalog-service.ts";
import { createRegistryStore } from "../../../../lib/offline-monitoring/registry-store.ts";
import { createMigrationPersistence } from "../../../../lib/offline-monitoring/registry-migration-store.ts";
import { createCheckHistoryStore } from "../../../../lib/offline-monitoring/check-history-store.ts";
import { runOfflineCheck } from "../../../../lib/offline-monitoring/check-service.ts";
import { reconcileOfflineIncidents } from "../../../../lib/offline-monitoring/incident-store.ts";
import { runOfflineNotificationDispatch } from "../../../../lib/offline-monitoring/notification-service.ts";
import type { OfflineMonitoringRegistryVehicle } from "../../../../lib/offline-monitoring/types.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function isAuthorizedCronRequest(
  request: Request,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const secret = environment.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || !authorization) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ success: false }, { status: 401 });
  }

  try {
    const scheduledSlot = request.headers.get("x-scheduled-slot") ?? request.headers.get("x-vercel-cron") ?? new Date().toISOString().slice(0, 13);
    const result = await runRegistryBackedDailyJob({ scheduledSlot }, await createDefaultDependencies());

    return Response.json({ success: true, result });
  } catch (error) {
    console.error(
      "The daily offline vehicle monitoring job failed.",
      error instanceof Error ? error.message : error,
    );

    return Response.json(
      {
        success: false,
        error: "The daily offline vehicle monitoring job failed.",
      },
      { status: 500 },
    );
  }
}

async function createDefaultDependencies() {
  const database = await getMongoDatabase();
  const registry = createRegistryStore(database);
  const catalog = createCatalogService({
    fetchVehicles: async () => (await getCybermapaVehicles()).map((vehicle) => ({
      system: "CYBERMAPA" as const,
      plate: vehicle.plate,
      gpsId: vehicle.gpsId,
      companyName: vehicle.companyName,
    })),
    store: registry,
  });
  const migration = createMigrationPersistence(database);
  const history = createCheckHistoryStore(database);
  return {
    synchronize: () => catalog.synchronize(),
    hasMigrationMarker: () => migration.hasMarker("legacy-87-v1"),
    listEnabled: () => registry.listEnabled(),
    runCheck: (input: { executionId: string; source: "cron"; targets: OfflineMonitoringRegistryVehicle[]; now: Date; thresholdHours: number }) => runOfflineCheck(input, {
      history,
      getReports: getCybermapaVehicleReports,
      reconcile: reconcileOfflineIncidents,
    }),
    dispatch: (input: { send: true }) => runOfflineNotificationDispatch(input),
  };
}
