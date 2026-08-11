import { listOperators } from "../../../../lib/offline-monitoring/operator-directory-store.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const operators = await listOperators();

    return Response.json({ success: true, operators });
  } catch (error) {
    console.error(
      "The offline board operator directory could not be listed.",
      error instanceof Error ? error.message : error,
    );

    return Response.json(
      {
        success: false,
        error: "The offline board operator directory could not be listed.",
      },
      { status: 500 },
    );
  }
}
