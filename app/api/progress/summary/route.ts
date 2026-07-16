import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok, withRequestContext } from "@/lib/http";
import { computeProgressSummary } from "@/server/store";

async function getProgressSummaryHandler(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    return ok({ summary: await computeProgressSummary(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequestContext(getProgressSummaryHandler);
