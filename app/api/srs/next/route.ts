import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok, withRequestContext } from "@/lib/http";
import { getDueCards } from "@/server/store";

async function getNextSrsCardsHandler(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get("limit") ?? 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 10;
    const cards = await getDueCards(userId, limit);
    return ok({ cards });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequestContext(getNextSrsCardsHandler);
