import {
  getIncomingMessages,
  getOutgoingMessages,
} from "@/lib/whatsapp-message-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const [messages, outgoingMessages] = await Promise.all([
      getIncomingMessages(),
      getOutgoingMessages(),
    ]);

    return Response.json(
      {
        messages,
        outgoingMessages,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return Response.json(
      {
        messages: [],
        outgoingMessages: [],
        error: "Unable to load incoming messages.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
