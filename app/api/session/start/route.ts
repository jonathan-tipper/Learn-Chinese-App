import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok, parseBody, withRequestContext } from "@/lib/http";
import { sessionStartSchema } from "@/lib/schemas";
import { generatePlanSnippet } from "@/server/agents/curriculumPlanner";
import { closeStaleSessions } from "@/server/agents/sessionLifecycle";
import { createSession } from "@/server/store";

async function sessionStartHandler(request: Request) {
  try {
    const body = await parseBody(request, sessionStartSchema);
    const userId = await getUserIdFromRequest(request);

    // Never let bookkeeping block the learner from starting.
    const closedStale = await closeStaleSessions(userId).catch((error) => {
      console.warn("Could not close stale sessions", error);
      return [];
    });

    const [session, planSnippet] = await Promise.all([
      createSession(userId, body.mode),
      generatePlanSnippet(userId)
    ]);

    return ok({
      sessionId: session.id,
      startedAt: session.startedAt,
      planSnippet,
      closedStaleSessions: closedStale.length
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRequestContext(sessionStartHandler);
