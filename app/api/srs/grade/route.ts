import { getUserIdFromHeaders } from "@/lib/auth";
import { badRequest, ok, parseBody } from "@/lib/http";
import { srsGradeSchema } from "@/lib/schemas";
import { gradeCard } from "@/server/store/inMemory";

export async function POST(request: Request) {
  try {
    const userId = getUserIdFromHeaders();
    const body = await parseBody(request, srsGradeSchema);
    const card = gradeCard(userId, body.cardId, body.grade);
    if (!card) {
      return badRequest("Card not found");
    }

    return ok({ nextDueAt: card.nextDueAt, ease: card.ease, interval: card.interval });
  } catch (error) {
    return badRequest((error as Error).message);
  }
}
