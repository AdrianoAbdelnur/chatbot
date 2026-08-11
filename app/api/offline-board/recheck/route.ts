import { recheckOfflineVehicle } from "../../../../lib/offline-monitoring/recheck-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reject(error: string) {
  return Response.json({ success: false, error }, { status: 400 });
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return reject("The request body must be valid JSON.");
  }

  if (typeof payload !== "object" || payload === null) {
    return reject("The request body must be an object.");
  }

  const { operatorId, incidentId } = payload as Record<string, unknown>;

  if (typeof operatorId !== "string" || typeof incidentId !== "string") {
    return reject("The operator id and incident id are required.");
  }

  try {
    const result = await recheckOfflineVehicle({ operatorId, incidentId });

    if (result.status === "rejected") {
      return reject(result.reason);
    }

    if (result.status === "upstream_failure") {
      return Response.json(
        { success: false, error: "The vehicle report could not be read." },
        { status: 502 },
      );
    }

    return Response.json({ success: true, outcome: result.status });
  } catch (error) {
    console.error(
      "The offline vehicle re-check failed.",
      error instanceof Error ? error.message : error,
    );

    return Response.json(
      { success: false, error: "The offline vehicle re-check failed." },
      { status: 500 },
    );
  }
}
