import { closeMongoConnection } from "../lib/mongodb.ts";
import { runOfflineNotificationDispatch } from "../lib/offline-monitoring/notification-service.ts";

const send = process.argv.includes("--send");

try {
  const result = await runOfflineNotificationDispatch({ send });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "The offline notification preview failed.",
  );
  process.exitCode = 1;
} finally {
  await closeMongoConnection();
}
