import { runOfflineNotificationDispatch } from "./notification-service.ts";
import { runCybermapaOfflineCheck } from "./scanner.ts";
import { LEGACY_87_MIGRATION_ID } from "./registry-migration.ts";
import type { OfflineMonitoringRegistryVehicle } from "./types.ts";

type OfflineMonitoringDailyJobDependencies = {
  scan: typeof runCybermapaOfflineCheck;
  dispatch: typeof runOfflineNotificationDispatch;
};

const defaultDependencies: OfflineMonitoringDailyJobDependencies = {
  scan: runCybermapaOfflineCheck,
  dispatch: runOfflineNotificationDispatch,
};

export async function runOfflineMonitoringDailyJob(
  dependencies: OfflineMonitoringDailyJobDependencies = defaultDependencies,
) {
  const scan = await dependencies.scan({ persist: true });
  const notifications = await dependencies.dispatch({ send: true });

  return {
    checkedAt: scan.checkedAt,
    thresholdHours: scan.thresholdHours,
    contacts: scan.contactCount,
    eligibleVehicles: scan.eligibleVehicleCount,
    delayedVehicles: scan.delayedVehicleCount,
    missingReports: scan.missingReportCount,
    reconciliation: scan.reconciliation,
    notifications: {
      planned: notifications.notificationCount,
      accepted: notifications.acceptedCount,
      failed: notifications.failedCount,
      skippedDuplicates: notifications.skippedDuplicateCount,
      skippedWithoutContact: notifications.skippedWithoutContact,
      failures: notifications.failures,
    },
  };
}

type RegistryDailyDependencies = {
  synchronize(): Promise<unknown>;
  hasMigrationMarker(): Promise<boolean>;
  listEnabled(): Promise<OfflineMonitoringRegistryVehicle[]>;
  runCheck(input: { executionId: string; source: "cron"; targets: OfflineMonitoringRegistryVehicle[]; now: Date; thresholdHours: number }): Promise<{ status: string; [key: string]: unknown }>;
  dispatch(input: { send: true }): ReturnType<typeof runOfflineNotificationDispatch>;
};

export function resolveCronExecutionId(scheduledSlot: string) {
  return `cron:${scheduledSlot}`;
}

export async function runRegistryBackedDailyJob(
  input: { scheduledSlot: string; now?: Date; thresholdHours?: number },
  dependencies: RegistryDailyDependencies,
) {
  await dependencies.synchronize();
  if (!(await dependencies.hasMigrationMarker())) throw new Error(`${LEGACY_87_MIGRATION_ID} migration is not initialized.`);
  const vehicles = (await dependencies.listEnabled()).filter((vehicle) => vehicle.identityStatus === "ok");
  const execution = await dependencies.runCheck({
    executionId: resolveCronExecutionId(input.scheduledSlot),
    source: "cron",
    targets: vehicles,
    now: input.now ?? new Date(),
    thresholdHours: input.thresholdHours ?? 48,
  });
  const notifications = execution.status === "failed" ? null : await dependencies.dispatch({ send: true });
  return { executionId: resolveCronExecutionId(input.scheduledSlot), execution, notifications };
}
