import { getUserIdFromHeaders } from "@/lib/auth";
import { ok } from "@/lib/http";
import { computeProgressSummary } from "@/server/store/inMemory";

export async function GET() {
  const userId = getUserIdFromHeaders();
  return ok({ summary: computeProgressSummary(userId) });
}
