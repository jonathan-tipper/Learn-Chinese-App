import { getUserIdFromRequest } from "@/lib/auth";
import { badRequest, errorResponse, ok, parseBody } from "@/lib/http";
import { tonePracticeAttemptsSchema } from "@/lib/schemas";
import { deriveWeakTonePairRollups, formatWeakTonePairLabel } from "@/lib/tone-practice";
import { recordTonePracticeAttempts } from "@/server/store";

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const body = await parseBody(request, tonePracticeAttemptsSchema);
    const attempts = await recordTonePracticeAttempts(userId, body.sessionId, body.attempts);

    if (!attempts) {
      return badRequest("Session not found");
    }

    return ok({
      ok: true,
      recordedCount: attempts.length,
      weakTonePairs: deriveWeakTonePairRollups(attempts).map(formatWeakTonePairLabel)
    });
  } catch (error) {
    return errorResponse(error);
  }
}
