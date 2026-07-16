import { getUserIdFromRequest } from "@/lib/auth";
import { badRequest, errorResponse, ok, parseBody, withRequestContext } from "@/lib/http";
import { srsGradeSchema } from "@/lib/schemas";
import { gradeCard } from "@/server/store";

async function gradeSrsCardHandler(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const body = await parseBody(request, srsGradeSchema);
    const card = await gradeCard(userId, body.cardId, body.grade);
    if (!card) {
      return badRequest("Card not found");
    }

    return ok({ nextDueAt: card.nextDueAt, ease: card.ease, interval: card.interval });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRequestContext(gradeSrsCardHandler);
