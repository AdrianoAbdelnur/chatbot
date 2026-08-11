import { closeMongoConnection } from "../lib/mongodb.ts";
import { upsertOperator } from "../lib/offline-monitoring/operator-directory-store.ts";

// Sample directory used to exercise the offline operator board. Operators are
// attribution-only records: no credentials, no sessions, no access control.
// The seed is purely additive — it never disables or removes an operator that
// is already in the collection.
const SEED_OPERATORS = [
  { id: "operator-01", name: "Ana Gómez" },
  { id: "operator-02", name: "Bruno Díaz" },
  { id: "operator-03", name: "Carla Ruiz" },
  { id: "operator-04", name: "Diego Sosa" },
  { id: "operator-05", name: "Elena Paz" },
];

try {
  const operatorIds = [];

  for (const operator of SEED_OPERATORS) {
    operatorIds.push(await upsertOperator(operator));
  }

  console.log(
    JSON.stringify({ seeded: operatorIds.length, operatorIds }, null, 2),
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "The offline operator seed failed.",
  );
  process.exitCode = 1;
} finally {
  await closeMongoConnection();
}
