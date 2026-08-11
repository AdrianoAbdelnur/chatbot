import { authorizeOfflineIncidents } from "../../../../lib/offline-monitoring/authorization-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const { operatorId, incidentIds } = payload as Record<string, unknown>;

  if (typeof operatorId !== "string") {
    return reject("The operator id is required.");
  }

  if (
    !Array.isArray(incidentIds) ||
    incidentIds.some((incidentId) => typeof incidentId !== "string")
  ) {
    return reject("The incident ids must be an array of strings.");
  }

  try {
    const result = await authorizeOfflineIncidents({
      operatorId,
      incidentIds: incidentIds as string[],
    });

    if (result.status === "rejected") {
      return reject(result.reason);
    }

    return Response.json({ success: true, dispatches: result.dispatches });
  } catch (error) {
    console.error(
      "The offline incident authorization failed.",
      error instanceof Error ? error.message : error,
    );

    return Response.json(
      {
        success: false,
        error: "The offline incident authorization failed.",
      },
      { status: 502 },
    );
  }
}
