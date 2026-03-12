import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/http";
import { env, isVeniceEnabled } from "@/lib/env";
import { computeProgressSummary, listSessionsByUser } from "@/server/store";

async function generateRecapWithVenice(input: {
  totalSessions: number;
  totalMinutes: number;
  streakDays: number;
  vocabLearning: number;
  weakAreas: string[];
  sessionSummaries: string[];
}): Promise<string> {
  const prompt = [
    "Generate a short, encouraging \"Your week in Mandarin\" recap (2-3 sentences max) for a language learner.",
    `Stats: ${input.totalSessions} sessions, ${input.totalMinutes} minutes practiced, ${input.streakDays} day streak, ${input.vocabLearning} vocabulary items in learning.`,
    input.weakAreas.length > 0 ? `Weak areas to mention: ${input.weakAreas.join(", ")}.` : "",
    input.sessionSummaries.length > 0
      ? `Recent session notes: ${input.sessionSummaries.slice(0, 3).join("; ")}`
      : "",
    "Be specific, warm, and motivating. Include 1-2 Mandarin words if relevant. Return plain text only, no JSON."
  ].filter(Boolean).join("\n");

  const response = await fetch(`${env.veniceBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.veniceApiKey}`
    },
    body: JSON.stringify({
      model: env.veniceSimpleModel,
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content: "You are a friendly Mandarin learning coach writing a brief weekly progress recap."
        },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Venice request failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty recap response");
  return content;
}

function generateStaticRecap(input: {
  totalSessions: number;
  totalMinutes: number;
  streakDays: number;
  vocabLearning: number;
}): string {
  if (input.totalSessions === 0) {
    return "You haven't started learning yet — your first session is waiting! Every journey begins with 你好 (nǐ hǎo).";
  }
  const minuteStr = input.totalMinutes >= 60
    ? `${Math.floor(input.totalMinutes / 60)}h ${input.totalMinutes % 60}m`
    : `${input.totalMinutes} minutes`;
  return `Great work this week! You completed ${input.totalSessions} session${input.totalSessions !== 1 ? "s" : ""} totaling ${minuteStr} of Mandarin practice, and you're building a vocabulary of ${input.vocabLearning} words. Keep up the momentum — 加油 (jiā yóu)!`;
}

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const [summary, sessions] = await Promise.all([
      computeProgressSummary(userId),
      listSessionsByUser(userId)
    ]);

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentSessions = sessions.filter(
      (s) => s.endedAt && s.endedAt >= oneWeekAgo
    );
    const sessionSummaries = recentSessions
      .map((s) => s.summary)
      .filter((s): s is string => Boolean(s));

    let recap: string;
    if (isVeniceEnabled()) {
      try {
        recap = await generateRecapWithVenice({
          totalSessions: recentSessions.length,
          totalMinutes: summary.totalMinutes,
          streakDays: summary.streakDays,
          vocabLearning: summary.vocabLearning,
          weakAreas: summary.weakAreas,
          sessionSummaries
        });
      } catch {
        recap = generateStaticRecap({
          totalSessions: summary.totalSessions,
          totalMinutes: summary.totalMinutes,
          streakDays: summary.streakDays,
          vocabLearning: summary.vocabLearning
        });
      }
    } else {
      recap = generateStaticRecap({
        totalSessions: summary.totalSessions,
        totalMinutes: summary.totalMinutes,
        streakDays: summary.streakDays,
        vocabLearning: summary.vocabLearning
      });
    }

    return ok({ recap });
  } catch (error) {
    return errorResponse(error);
  }
}
