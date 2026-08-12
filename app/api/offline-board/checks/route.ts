import { getCybermapaVehicleReports, getCybermapaVehicles } from "../../../../lib/cybermapa/services.ts";
import { getMongoDatabase } from "../../../../lib/mongodb.ts";
import { createCatalogService } from "../../../../lib/offline-monitoring/catalog-service.ts";
import { createRegistryStore } from "../../../../lib/offline-monitoring/registry-store.ts";
import { createCheckHistoryStore } from "../../../../lib/offline-monitoring/check-history-store.ts";
import { createManualCheckDependencies, runManualCheck } from "../../../../lib/offline-monitoring/manual-check-service.ts";
import { findOperatorById } from "../../../../lib/offline-monitoring/operator-directory-store.ts";
import { reconcileOfflineIncidents } from "../../../../lib/offline-monitoring/incident-store.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function createPostHandler(dependenciesFactory: () => ReturnType<typeof createDefaultDependencies>) {
  return async function POST(request: Request) {
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (!idempotencyKey) return Response.json({ success: false, error: "Idempotency-Key is required." }, { status: 400 });
  try {
    const body = await request.json();
    if (!body || typeof body.operatorId !== "string" || !Array.isArray(body.companyKeys) || !Array.isArray(body.vehicles)) {
      return Response.json({ success: false, error: "Invalid manual check payload." }, { status: 400 });
    }
    const result = await runManualCheck({ operatorId: body.operatorId, companyKeys: body.companyKeys, vehicles: body.vehicles, idempotencyKey }, await dependenciesFactory());
    return Response.json({ success: true, result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manual check failed.";
    const status = /invalid manual target|selection must not be empty|unknown operator|Invalid manual/.test(message) ? 400 : 500;
    return Response.json({ success: false, error: status === 400 ? message : "Manual check failed." }, { status });
  }
  };
}

export const POST = createPostHandler(createDefaultDependencies);

async function createDefaultDependencies() {
  const database = await getMongoDatabase();
  const registry = createRegistryStore(database);
  const catalog = createCatalogService({
    fetchVehicles: async () => (await getCybermapaVehicles()).map((vehicle) => ({ system: "CYBERMAPA" as const, plate: vehicle.plate, gpsId: vehicle.gpsId, companyName: vehicle.companyName })),
    store: registry,
  });
  return createManualCheckDependencies({ catalog, registry, history: createCheckHistoryStore(database), getReports: getCybermapaVehicleReports, reconcile: reconcileOfflineIncidents, findOperator: findOperatorById });
}
