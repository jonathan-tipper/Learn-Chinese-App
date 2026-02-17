import { getUserIdFromHeaders } from "@/lib/auth";
import { ok } from "@/lib/http";
import { getDueCards } from "@/server/store/inMemory";

export async function GET(request: Request) {
  const userId = getUserIdFromHeaders();
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 10);
  const cards = getDueCards(userId, Number.isNaN(limit) ? 10 : limit);
  return ok({ cards });
}
