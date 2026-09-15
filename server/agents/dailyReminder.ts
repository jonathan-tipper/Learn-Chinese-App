import type { LearningPlanItem, Profile } from "@/lib/types";
import { getTodayPlanFocus, localDateString } from "@/server/agents/curriculumPlanner";
import { computeProgressSummary, listProfilesWithReminders, listSessionsByUser, saveProfile } from "@/server/store";
import { activeDaysFromSessions } from "@/server/store/sessionActivity";

/**
 * Daily reminder agent. Runs hourly from a cron; for each learner whose chosen reminder
 * hour matches the current hour in their timezone and who has not practised today, builds
 * a message from today's plan item and review load and sends it via Web Push.
 */

export function localHour(date: Date, timeZone?: string) {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", { timeZone: timeZone || "UTC", hour: "2-digit", hour12: false }).format(date);
    return Number(hour) % 24;
  } catch {
    return date.getUTCHours();
  }
}

export interface ReminderMessage {
  title: string;
  body: string;
  url: string;
}

export function buildReminderMessage(input: {
  profile: Profile;
  planItem?: LearningPlanItem | null;
  dueCards: number;
  streakDays: number;
}): ReminderMessage {
  const minutes = input.profile.minutesPerDay || 10;
  const streak = input.streakDays > 0 ? ` Streak: ${input.streakDays} day${input.streakDays === 1 ? "" : "s"}.` : "";

  if (input.planItem) {
    const review = input.dueCards > 0 ? ` ${input.dueCards} card${input.dueCards === 1 ? "" : "s"} due.` : "";
    return {
      title: `Today: ${input.planItem.title}`,
      body: `${input.planItem.canDo} · ~${minutes} min.${review}${streak}`,
      url: "/chat"
    };
  }

  if (input.dueCards > 0) {
    return {
      title: `${input.dueCards} card${input.dueCards === 1 ? "" : "s"} waiting`,
      body: `A 2-minute review keeps them fresh.${streak}`,
      url: "/review"
    };
  }

  return {
    title: "Time for a little Mandarin",
    body: `Your coach has a ${minutes}-minute session ready.${streak}`,
    url: "/chat"
  };
}

export interface ReminderCandidate {
  profile: Profile;
  message: ReminderMessage;
  localDate: string;
}

/** Decide who should be nudged right now. Pure apart from store reads. */
export async function collectReminderCandidates(now = new Date()): Promise<ReminderCandidate[]> {
  const profiles = await listProfilesWithReminders();
  const candidates: ReminderCandidate[] = [];

  for (const profile of profiles) {
    if (typeof profile.reminderHour !== "number") continue;
    if (localHour(now, profile.timezone) !== profile.reminderHour) continue;

    const localDate = localDateString(now, profile.timezone);
    if (profile.lastReminderDate === localDate) continue;

    const sessions = await listSessionsByUser(profile.userId).catch(() => []);
    const practisedToday = Array.from(activeDaysFromSessions(sessions)).some((day) => day === localDate || day === now.toISOString().slice(0, 10));
    if (practisedToday) continue;

    const [today, progress] = await Promise.all([
      getTodayPlanFocus(profile.userId).catch(() => null),
      computeProgressSummary(profile.userId).catch(() => ({ dueCards: 0, streakDays: 0 }))
    ]);

    candidates.push({
      profile,
      localDate,
      message: buildReminderMessage({
        profile,
        planItem: today?.item ?? null,
        dueCards: progress.dueCards,
        streakDays: progress.streakDays
      })
    });
  }

  return candidates;
}

export async function markReminderSent(profile: Profile, localDate: string) {
  await saveProfile({ ...profile, lastReminderDate: localDate });
}
