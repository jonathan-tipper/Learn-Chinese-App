import { getUserIdFromRequest } from "@/lib/auth";
import { badRequest, errorResponse, ok, parseBody, withRequestContext } from "@/lib/http";
import { sessionEndSchema } from "@/lib/schemas";
import { finishSession } from "@/server/agents/sessionLifecycle";

async function sessionEndHandler(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const body = await parseBody(request, sessionEndSchema);
    const session = await finishSession({
      userId,
      sessionId: body.sessionId,
      clientDurationSec: body.durationSec,
      clientSummary: body.summary
    });
    if (!session) {
      return badRequest("Session not found");
    }

    return ok({
      ok: true,
      metrics: { durationSec: session.durationSec ?? 0 },
      summary: session.summary ?? null
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRequestContext(sessionEndHandler);
