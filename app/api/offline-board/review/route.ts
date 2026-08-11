import { submitOperatorReview } from "../../../../lib/offline-monitoring/operator-board-service.ts";

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

  const { operatorId, incidentId, operationalStatus, comment } =
    payload as Record<string, unknown>;

  if (
    typeof operatorId !== "string" ||
    typeof incidentId !== "string" ||
    typeof operationalStatus !== "string"
  ) {
    return reject(
      "The operator id, incident id and operational status are required.",
    );
  }

  if (comment !== undefined && typeof comment !== "string") {
    return reject("The comment must be a string.");
  }

  try {
    const result = await submitOperatorReview({
      operatorId,
      incidentId,
      operationalStatus,
      comment,
    });

    if (result.status === "rejected") {
      return reject(result.reason);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error(
      "The offline incident review could not be applied.",
      error instanceof Error ? error.message : error,
    );

    return Response.json(
      {
        success: false,
        error: "The offline incident review could not be applied.",
      },
      { status: 500 },
    );
  }
}
