import { runOfflineNotificationDispatch } from "./notification-service.ts";
import { runCybermapaOfflineCheck } from "./scanner.ts";

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
