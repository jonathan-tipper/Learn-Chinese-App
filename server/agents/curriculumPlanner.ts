import { env, isVeniceEnabled } from "@/lib/env";
import { computeProgressSummary, getProfile, listSessionsByUser } from "@/server/store";

const FALLBACK_PLAN = "Today: vocabulary review + one practical conversation exchange.";

export async function generatePlanSnippet(userId: string): Promise<string> {
  try {
    const [profile, sessions, progress] = await Promise.all([
      getProfile(userId),
      listSessionsByUser(userId),
      computeProgressSummary(userId)
    ]);

    if (!profile) return FALLBACK_PLAN;

    const recentSummaries = sessions
      .filter((s) => s.summary)
      .slice(0, 3)
      .map((s) => `- ${s.summary}`)
      .join("\n");

    const weakAreas = progress.weakAreas.length > 0
      ? progress.weakAreas.join(", ")
      : "none identified yet";

    const prompt = [
      "You are a Mandarin curriculum planner. Given a learner's profile and recent progress, write a single concise sentence (max 15 words) describing today's session focus. Start with \"Today:\".",
      `Profile: level=${profile.level}; goals=${profile.goals.join(", ")}; interests=${profile.interests.join(", ")}; minutesPerDay=${profile.minutesPerDay}`,
      `Recent sessions:\n${recentSummaries || "No sessions yet."}`,
      `Weak areas: ${weakAreas}`,
      "Respond with only the plan sentence. No explanation."
    ].join("\n\n");

    if (!isVeniceEnabled()) return FALLBACK_PLAN;

    const response = await fetch(`${env.veniceBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.veniceApiKey}`
      },
      body: JSON.stringify({
        model: env.veniceSimpleModel,
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }]
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return FALLBACK_PLAN;

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    return content || FALLBACK_PLAN;
  } catch {
    return FALLBACK_PLAN;
  }
}
