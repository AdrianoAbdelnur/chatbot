import { getMongoDatabase } from "../../../../lib/mongodb.ts";
import { LEGACY_87_MIGRATION_ID } from "../../../../lib/offline-monitoring/registry-migration.ts";
import { createMigrationPersistence } from "../../../../lib/offline-monitoring/registry-migration-store.ts";
import { createRegistryStore } from "../../../../lib/offline-monitoring/registry-store.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MembershipDependencies = {
  hasMarker: () => Promise<boolean>;
  setMembership: (vehicleId: string, enabled: boolean) => Promise<unknown>;
};

function reject(error: string, status = 400) {
  return Response.json({ success: false, error }, { status, headers: { "cache-control": "no-store" } });
}

export function createMembershipPatchHandler(dependencies: MembershipDependencies) {
  return async function PATCH(request: Request) {
    let payload: unknown;
    try { payload = await request.json(); } catch { return reject("The request body must be valid JSON."); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return reject("The request body must be an object.");
    const { vehicleId, enabled } = payload as Record<string, unknown>;
    if (typeof vehicleId !== "string" || !/^CYBERMAPA:[A-Z0-9]+$/.test(vehicleId) || typeof enabled !== "boolean") return reject("The vehicle id and enabled membership value are required.");
    if (!await dependencies.hasMarker()) return reject("Offline monitoring membership is not initialized.", 409);
    const vehicle = await dependencies.setMembership(vehicleId, enabled);
    if (!vehicle) return reject("The vehicle is unavailable for membership changes.", 404);
    return Response.json({ success: true, vehicle }, { headers: { "cache-control": "no-store" } });
  };
}

export async function PATCH(request: Request) {
  const database = await getMongoDatabase();
  const migration = createMigrationPersistence(database);
  const registry = createRegistryStore(database);
  return createMembershipPatchHandler({ hasMarker: () => migration.hasMarker(LEGACY_87_MIGRATION_ID), setMembership: registry.setMembership })(request);
}
