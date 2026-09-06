import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok, withRequestContext } from "@/lib/http";
import { ensureLearningPlan, localDateString, planItemForDate } from "@/server/agents/curriculumPlanner";
import { getProfile, logAgentRun } from "@/server/store";

async function respondWithPlan(userId: string, force: boolean) {
  const [result, profile] = await Promise.all([ensureLearningPlan(userId, { force }), getProfile(userId)]);
  if (!result) return ok({ plan: null, today: null });

  if (result.generated && result.usage) {
    await logAgentRun({
      userId,
      sessionId: result.plan.id,
      nodeName: "CurriculumPlanner",
      provider: result.model ? `venice:${result.model}` : "venice",
      tokens: result.usage.totalTokens,
      latencyMs: 0,
      costEstimate: result.costUsd ?? 0
    });
  }

  const today = localDateString(new Date(), profile?.timezone);
  return ok({
    plan: result.plan,
    today: planItemForDate(result.plan, today) ?? null,
    todayDate: today,
    generated: result.generated
  });
}

async function getPlanHandler(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    return await respondWithPlan(userId, false);
  } catch (error) {
    return errorResponse(error);
  }
}

async function regeneratePlanHandler(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    return await respondWithPlan(userId, true);
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequestContext(getPlanHandler);
export const POST = withRequestContext(regeneratePlanHandler);
