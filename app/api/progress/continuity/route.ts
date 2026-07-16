import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok, withRequestContext } from "@/lib/http";
import { deriveWeakTonePairRollups, formatToneFocusLabel } from "@/lib/tone-practice";
import { getLastCompletedSession, listSessionsByUser } from "@/server/store";

async function getContinuityHandler(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const [lastSession, sessions] = await Promise.all([
      getLastCompletedSession(userId),
      listSessionsByUser(userId)
    ]);

    if (!lastSession) {
      return ok({ continuity: null });
    }

    const sessionDate = (lastSession.endedAt ?? lastSession.startedAt).slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    let when = sessionDate;
    if (sessionDate === today) when = "today";
    else if (sessionDate === yesterday) when = "yesterday";

    const tonePracticeAttempts = sessions.flatMap((session) => session.metrics?.tonePracticeAttempts ?? []);
    const toneFocus = deriveWeakTonePairRollups(tonePracticeAttempts, { limit: 1 })
      .map(formatToneFocusLabel)[0];

    return ok({
      continuity: {
        sessionDate,
        when,
        summary: lastSession.summary ?? null,
        mode: lastSession.mode,
        ...(toneFocus ? { toneFocus } : {})
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequestContext(getContinuityHandler);
