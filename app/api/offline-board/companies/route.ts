import { listMonitoringCompanies } from "../../../../lib/offline-monitoring/company-scan-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const companies = await listMonitoringCompanies();

    return Response.json({ success: true, companies });
  } catch (error) {
    console.error(
      "The monitoring company list could not be read.",
      error instanceof Error ? error.message : error,
    );

    return Response.json(
      {
        success: false,
        error: "The monitoring company list could not be read.",
      },
      { status: 502 },
    );
  }
}
