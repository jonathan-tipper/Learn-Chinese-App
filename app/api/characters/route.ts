import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/http";
import { listCharacterCards } from "@/server/store";

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const cards = await listCharacterCards(userId);
    return ok({ cards });
  } catch (error) {
    return errorResponse(error);
  }
}
