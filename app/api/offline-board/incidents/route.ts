import { listOperatorBoard } from "../../../../lib/offline-monitoring/operator-board-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await listOperatorBoard();

    return Response.json({
      success: true,
      rows,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "The offline operator board could not be listed.",
      error instanceof Error ? error.message : error,
    );

    return Response.json(
      {
        success: false,
        error: "The offline operator board could not be listed.",
      },
      { status: 500 },
    );
  }
}
