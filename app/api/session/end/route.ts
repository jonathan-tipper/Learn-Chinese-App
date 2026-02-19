import { getUserIdFromRequest } from "@/lib/auth";
import { badRequest, errorResponse, ok, parseBody } from "@/lib/http";
import { sessionEndSchema } from "@/lib/schemas";
import { endSession } from "@/server/store";

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const body = await parseBody(request, sessionEndSchema);
    const session = await endSession(body.sessionId, body.durationSec, body.summary, userId);
    if (!session) {
      return badRequest("Session not found");
    }

    return ok({ ok: true, metrics: { durationSec: session.durationSec ?? 0 } });
  } catch (error) {
    return errorResponse(error);
  }
}
