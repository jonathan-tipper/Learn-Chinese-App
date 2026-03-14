import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok, parseBody } from "@/lib/http";
import { sessionStartSchema } from "@/lib/schemas";
import { generatePlanSnippet } from "@/server/agents/curriculumPlanner";
import { createSession } from "@/server/store";

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, sessionStartSchema);
    const userId = await getUserIdFromRequest(request);
    const [session, planSnippet] = await Promise.all([
      createSession(userId, body.mode),
      generatePlanSnippet(userId)
    ]);

    return ok({
      sessionId: session.id,
      startedAt: session.startedAt,
      planSnippet
    });
  } catch (error) {
    return errorResponse(error);
  }
}
