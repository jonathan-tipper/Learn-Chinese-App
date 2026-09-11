import { env, isPushEnabled } from "@/lib/env";
import { errorResponse, ok, unauthorized, withRequestContext } from "@/lib/http";
import { collectReminderCandidates, markReminderSent } from "@/server/agents/dailyReminder";
import { sendPushToUser } from "@/server/push";

/**
 * Hourly cron (see vercel.json). Vercel sends `Authorization: Bearer <CRON_SECRET>`;
 * the service-role key is also accepted so it can be triggered manually.
 */
function isAuthorized(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return false;
  return (env.cronSecret && token === env.cronSecret) || token === env.supabaseServiceRoleKey;
}

async function dailyReminderHandler(request: Request) {
  try {
    if (!isAuthorized(request)) return unauthorized("Cron only");

    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dryRun") === "1";
    const candidates = await collectReminderCandidates(new Date());

    if (dryRun || !isPushEnabled()) {
      return ok({
        dryRun: true,
        pushConfigured: isPushEnabled(),
        candidates: candidates.map((candidate) => ({ userId: candidate.profile.userId, message: candidate.message }))
      });
    }

    const outcomes = [];
    for (const candidate of candidates) {
      try {
        const result = await sendPushToUser(candidate.profile.userId, { ...candidate.message, tag: "daily-reminder" });
        if (result.sent > 0) await markReminderSent(candidate.profile, candidate.localDate);
        outcomes.push({ userId: candidate.profile.userId, ...result });
      } catch (error) {
        outcomes.push({ userId: candidate.profile.userId, sent: 0, error: error instanceof Error ? error.message : "send failed" });
      }
    }

    return ok({ considered: candidates.length, outcomes });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequestContext(dailyReminderHandler);
export const POST = withRequestContext(dailyReminderHandler);
