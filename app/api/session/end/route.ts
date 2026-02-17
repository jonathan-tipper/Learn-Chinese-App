import { badRequest, ok, parseBody } from "@/lib/http";
import { sessionEndSchema } from "@/lib/schemas";
import { endSession } from "@/server/store/inMemory";

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, sessionEndSchema);
    const session = endSession(body.sessionId, body.durationSec, body.summary);
    if (!session) {
      return badRequest("Session not found");
    }

    return ok({ ok: true, metrics: { durationSec: session.durationSec ?? 0 } });
  } catch (error) {
    return badRequest((error as Error).message);
  }
}
