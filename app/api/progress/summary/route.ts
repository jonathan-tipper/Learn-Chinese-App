import { getUserIdFromRequest } from "@/lib/auth";
import { ok } from "@/lib/http";
import { computeProgressSummary } from "@/server/store";

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  return ok({ summary: await computeProgressSummary(userId) });
}
