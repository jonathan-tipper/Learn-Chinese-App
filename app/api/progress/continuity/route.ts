import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/http";
import { getLastCompletedSession } from "@/server/store";

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const lastSession = await getLastCompletedSession(userId);

    if (!lastSession) {
      return ok({ continuity: null });
    }

    const sessionDate = (lastSession.endedAt ?? lastSession.startedAt).slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    let when = sessionDate;
    if (sessionDate === today) when = "today";
    else if (sessionDate === yesterday) when = "yesterday";

    return ok({
      continuity: {
        sessionDate,
        when,
        summary: lastSession.summary ?? null,
        mode: lastSession.mode
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
