import { getCybermapaVehicles } from "../lib/cybermapa/services.ts";
import { getMongoDatabase, closeMongoConnection } from "../lib/mongodb.ts";
import { COMPANY_CONTACT_COLLECTION_NAME } from "../lib/offline-monitoring/company-contact-store.ts";
import { LEGACY_87_MIGRATION_ID, createLegacy87Migration } from "../lib/offline-monitoring/registry-migration.ts";
import { createMigrationPersistence } from "../lib/offline-monitoring/registry-migration-store.ts";

const apply = process.argv.includes("--apply");
const countOnly = process.argv.includes("--count-only");

try {
  const database = await getMongoDatabase();
  const persistence = createMigrationPersistence(database);
  const migration = createLegacy87Migration({
    listLegacyPlates: async () => (await database.collection(COMPANY_CONTACT_COLLECTION_NAME).find({}, { projection: { vehiclePlates: 1 } }).toArray())
      .flatMap((contact) => Array.isArray(contact.vehiclePlates) ? contact.vehiclePlates : []),
    resolveCatalog: async () => (await getCybermapaVehicles()).map((vehicle) => ({ ...vehicle, system: "CYBERMAPA" as const })),
    hasMarker: () => persistence.hasMarker(LEGACY_87_MIGRATION_ID),
    createMarker: () => persistence.createMarker(LEGACY_87_MIGRATION_ID),
    initializeMembership: persistence.initializeMembership,
  });
  const result = await migration.run({ dryRun: !apply || countOnly });
  console.log(JSON.stringify({ migration: LEGACY_87_MIGRATION_ID, dryRun: !apply || countOnly, result }));
  if (result.status === "invalid") process.exitCode = 1;
} finally {
  await closeMongoConnection();
}