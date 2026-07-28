import { timingSafeEqual } from "node:crypto";

import { runOfflineMonitoringDailyJob } from "../../../../lib/offline-monitoring/daily-job.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function isAuthorizedCronRequest(
  request: Request,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const secret = environment.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || !authorization) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ success: false }, { status: 401 });
  }

  try {
    const result = await runOfflineMonitoringDailyJob();

    return Response.json({ success: true, result });
  } catch (error) {
    console.error(
      "The daily offline vehicle monitoring job failed.",
      error instanceof Error ? error.message : error,
    );

    return Response.json(
      {
        success: false,
        error: "The daily offline vehicle monitoring job failed.",
      },
      { status: 500 },
    );
  }
}
