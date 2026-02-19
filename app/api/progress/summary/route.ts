import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/http";
import { computeProgressSummary } from "@/server/store";

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    return ok({ summary: await computeProgressSummary(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}
