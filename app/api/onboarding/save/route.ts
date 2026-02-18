import { getUserIdFromRequest } from "@/lib/auth";
import { badRequest, ok, parseBody } from "@/lib/http";
import { onboardingSchema } from "@/lib/schemas";
import type { Profile } from "@/lib/types";
import { saveProfile } from "@/server/store";

export async function POST(request: Request) {
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

    return ok({
      ok: true,
      profile,
      firstWeekPlan: [
        "Day 1: Greetings + self-introduction",
        "Day 2: Ordering food/drink",
        "Day 3: Directions and transport",
        "Day 4: Work small talk",
        "Day 5: Review + roleplay"
      ]
    });
  } catch (error) {
    return badRequest((error as Error).message);
  }
}
