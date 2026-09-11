import { z } from "zod";
import { getUserIdFromRequest } from "@/lib/auth";
import { badRequest, errorResponse, ok, parseBody, withRequestContext } from "@/lib/http";
import { deriveWeakPronunciationAreas } from "@/lib/pronunciation";
import { scorePronunciation } from "@/server/agents/pronunciationCoach";
import { recordPronunciationAttempts } from "@/server/store";

const scoreSchema = z.object({
  target: z.string().min(1).max(80),
  transcript: z.string().max(200).default(""),
  sessionId: z.string().uuid().optional()
});

async function scoreHandler(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const body = await parseBody(request, scoreSchema);
    const result = scorePronunciation(body.target, body.transcript);
    if (!result.targetText) {
      return badRequest("The target phrase must contain Chinese characters.");
    }

    let weakAreas: string[] = [];
    if (body.sessionId) {
      const recorded = await recordPronunciationAttempts(userId, body.sessionId, [{
        target: result.targetText,
        transcript: result.heardText,
        score: result.score,
        toneContrastsMissed: result.toneContrastsMissed,
        soundsMissed: result.soundsMissed,
        timestamp: new Date().toISOString()
      }]);
      if (!recorded) return badRequest("Session not found");
      weakAreas = deriveWeakPronunciationAreas(recorded.all, { minCount: 1 });
    }

    return ok({ ...result, weakAreas });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRequestContext(scoreHandler);
