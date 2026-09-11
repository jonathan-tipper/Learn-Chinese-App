import type { SessionRecord } from "@/lib/types";

/** A session with no activity for this long is considered abandoned. */
export const STALE_SESSION_AFTER_MS = 30 * 60 * 1000;
/** Duration credited for a session that had activity but no clean end. */
const MIN_CREDITED_SEC = 60;
const MAX_CREDITED_SEC = 3 * 60 * 60;

export function isStaleSession(session: SessionRecord, now = Date.now()) {
  if (session.endedAt) return false;
  const lastActivity = session.metrics?.lastActivityAt ?? session.startedAt;
  return now - new Date(lastActivity).getTime() > STALE_SESSION_AFTER_MS;
}

/**
 * Estimate how long a learner actually practised. Client-reported durations are
 * unreliable (the chat page used to send a constant), so prefer server-side activity.
 */
export function estimateSessionDurationSec(
  session: Pick<SessionRecord, "startedAt" | "metrics">,
  options: { endedAt?: string; clientDurationSec?: number } = {}
) {
  const startedMs = new Date(session.startedAt).getTime();
  const lastActivity = session.metrics?.lastActivityAt;
  const hasActivity = (session.metrics?.messageCount ?? 0) > 0
    || (session.metrics?.tonePracticeAttempts?.length ?? 0) > 0
    || (session.metrics?.pronunciationAttempts?.length ?? 0) > 0;

  if (hasActivity && lastActivity) {
    const activeSec = Math.round((new Date(lastActivity).getTime() - startedMs) / 1000) + MIN_CREDITED_SEC;
    return Math.min(MAX_CREDITED_SEC, Math.max(MIN_CREDITED_SEC, activeSec));
  }

  if (options.endedAt && hasActivity) {
    const span = Math.round((new Date(options.endedAt).getTime() - startedMs) / 1000);
    return Math.min(MAX_CREDITED_SEC, Math.max(MIN_CREDITED_SEC, span));
  }

  if (typeof options.clientDurationSec === "number" && Number.isFinite(options.clientDurationSec)) {
    return Math.min(MAX_CREDITED_SEC, Math.max(0, Math.round(options.clientDurationSec)));
  }

  return hasActivity ? MIN_CREDITED_SEC : 0;
}

/** Calendar days (UTC) on which the learner did something. Open sessions count if they had messages. */
export function activeDaysFromSessions(sessions: SessionRecord[]) {
  const days = new Set<string>();
  for (const session of sessions) {
    if (session.endedAt) {
      days.add(session.endedAt.slice(0, 10));
      days.add(session.startedAt.slice(0, 10));
      continue;
    }
    if (
      (session.metrics?.messageCount ?? 0) > 0
      || (session.metrics?.tonePracticeAttempts?.length ?? 0) > 0
      || (session.metrics?.pronunciationAttempts?.length ?? 0) > 0
    ) {
      days.add((session.metrics?.lastActivityAt ?? session.startedAt).slice(0, 10));
    }
  }
  return days;
}

export function computeStreakDays(activeDays: Set<string>, now = new Date()) {
  let streak = 0;
  const cursor = new Date(now.toISOString().slice(0, 10));
  // Allow the streak to survive until the end of today: if there is no activity today yet,
  // start counting from yesterday.
  if (!activeDays.has(cursor.toISOString().slice(0, 10))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (activeDays.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function sessionMinutes(session: SessionRecord) {
  const seconds = session.durationSec ?? (session.endedAt ? 0 : estimateSessionDurationSec(session));
  return Math.round(seconds / 60);
}
