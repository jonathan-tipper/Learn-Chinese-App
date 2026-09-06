import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok, parseBody, withRequestContext } from "@/lib/http";
import { onboardingSchema } from "@/lib/schemas";
import type { Profile } from "@/lib/types";
import { ensureLearningPlan } from "@/server/agents/curriculumPlanner";
import { saveProfile } from "@/server/store";

const DEFAULT_FIRST_WEEK = [
  "Day 1: Greetings + self-introduction",
  "Day 2: Ordering food/drink",
  "Day 3: Directions and transport",
  "Day 4: Work small talk",
  "Day 5: Review + roleplay"
];

async function saveOnboardingHandler(request: Request) {
  try {
    const body = await parseBody(request, onboardingSchema);
    const userId = await getUserIdFromRequest(request);

    const profile: Profile = {
      userId,
      goals: body.goals,
      interests: body.interests,
      level: body.level,
      timezone: body.timezone,
      coachStyle: body.coachStyle,
      minutesPerDay: body.minutesPerDay,
      preferredSimpleModel: body.preferredSimpleModel,
      preferredComplexModel: body.preferredComplexModel
    };

    await saveProfile(profile);

    // A fresh profile deserves a fresh plan; fall back to the static week if planning fails.
    const planResult = await ensureLearningPlan(userId, { force: true }).catch(() => null);
    const firstWeekPlan = planResult
      ? planResult.plan.items.map((item) => `Day ${item.day}: ${item.title} — ${item.canDo}`)
      : DEFAULT_FIRST_WEEK;

    return ok({
      ok: true,
      profile,
      firstWeekPlan,
      plan: planResult?.plan ?? null
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRequestContext(saveOnboardingHandler);
