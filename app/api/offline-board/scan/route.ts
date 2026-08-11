import { scanCompanyVehicles } from "../../../../lib/offline-monitoring/company-scan-service.ts";

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

  const { operatorId, companyKey } = payload as Record<string, unknown>;

  // A whole-platform scan is deliberately not offered: one company per request
  // keeps the upstream call count bounded and the route inside its time budget.
  if (
    typeof operatorId !== "string" ||
    typeof companyKey !== "string" ||
    !companyKey.trim()
  ) {
    return reject("The operator id and company are required.");
  }

  try {
    const result = await scanCompanyVehicles({ operatorId, companyKey });

    if (result.status === "rejected") {
      return reject(result.reason);
    }

    if (result.status === "upstream_failure") {
      return Response.json(
        { success: false, error: "The vehicle reports could not be read." },
        { status: 502 },
      );
    }

    return Response.json({ success: true, result });
  } catch (error) {
    console.error(
      "The company vehicle scan failed.",
      error instanceof Error ? error.message : error,
    );

    return Response.json(
      { success: false, error: "The company vehicle scan failed." },
      { status: 500 },
    );
  }
}
