import { closeMongoConnection } from "../lib/mongodb.ts";
import { runCybermapaOfflineCheck } from "../lib/offline-monitoring/scanner.ts";

const persist = process.argv.includes("--persist");

try {
  const result = await runCybermapaOfflineCheck({ persist });

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "The offline check failed.",
  );
  process.exitCode = 1;
} finally {
  await closeMongoConnection();
}
