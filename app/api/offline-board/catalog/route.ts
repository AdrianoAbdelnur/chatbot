import { getCybermapaVehicles } from "../../../../lib/cybermapa/services.ts";
import { createCatalogService } from "../../../../lib/offline-monitoring/catalog-service.ts";
import { createRegistryStore } from "../../../../lib/offline-monitoring/registry-store.ts";
import { getMongoDatabase } from "../../../../lib/mongodb.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Catalog = Awaited<ReturnType<ReturnType<typeof createCatalogService>["synchronize"]>>;

function safeCatalog(catalog: Catalog) {
  return catalog.companies.map((company) => ({
    companyKey: company.companyKey,
    companyName: company.companyName,
    vehicles: company.vehicles.map((vehicle) => ({
      vehicleId: vehicle.vehicleId,
      companyKey: vehicle.companyKey,
      companyName: vehicle.companyName,
      plate: vehicle.plate,
      enabled: vehicle.enabled,
      present: vehicle.present,
      identityStatus: vehicle.identityStatus,
    })),
  }));
}

export function createCatalogGetHandler(dependencies: { synchronize: () => Promise<Catalog> }) {
  return async function GET() {
    try {
      const catalog = await dependencies.synchronize();
      return Response.json({ success: true, companies: safeCatalog(catalog) }, { headers: { "cache-control": "no-store" } });
    } catch {
      return Response.json({ success: false, error: "The monitoring catalog could not be synchronized." }, { status: 502, headers: { "cache-control": "no-store" } });
    }
  };
}

export async function GET() {
  const database = await getMongoDatabase();
  const service = createCatalogService({
    fetchVehicles: async () => (await getCybermapaVehicles()).map((vehicle) => ({ system: "CYBERMAPA" as const, plate: vehicle.plate, gpsId: vehicle.gpsId, companyName: vehicle.companyName })),
    store: createRegistryStore(database),
  });
  return createCatalogGetHandler(service)();
}
