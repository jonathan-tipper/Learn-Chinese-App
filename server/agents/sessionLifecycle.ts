import { summarizeSession } from "@/server/agents/sessionSummarizer";
import { markPlanProgress } from "@/server/agents/curriculumPlanner";
import {
  endSession,
  getProfile,
  getSessionForUser,
  listOpenSessions,
  listSessionMessages,
  logAgentRun
} from "@/server/store";
import { estimateSessionDurationSec, isStaleSession } from "@/server/store/sessionActivity";
import type { SessionRecord } from "@/lib/types";

const PLACEHOLDER_SUMMARIES = new Set(["session complete", "practice session", ""]);

function isPlaceholderSummary(summary?: string) {
  return !summary || PLACEHOLDER_SUMMARIES.has(summary.trim().toLowerCase());
}

/**
 * Learners rarely press "End". Close abandoned sessions when a new one starts so streaks,
 * minutes and continuity reflect real practice. Only the most recent abandoned session
 * gets a model-written summary; older ones get a deterministic one.
 */
export async function closeStaleSessions(userId: string, now = Date.now()) {
  const open = await listOpenSessions(userId);
  const stale = open.filter((session) => isStaleSession(session, now));
  if (!stale.length) return [] as SessionRecord[];

  const profile = await getProfile(userId).catch(() => null);
  const closed: SessionRecord[] = [];
  let summarizedOne = false;

  for (const session of stale) {
    const hasActivity = (session.metrics?.messageCount ?? 0) > 0 || (session.metrics?.tonePracticeAttempts?.length ?? 0) > 0;
    const endedAt = session.metrics?.lastActivityAt ?? session.startedAt;
    const durationSec = estimateSessionDurationSec(session, { endedAt });

    let summary = hasActivity ? "Practice session (closed automatically)" : "Opened without practising";
    let summaryGenerated = false;

    if (hasActivity && !summarizedOne) {
      const messages = await listSessionMessages(session.id).catch(() => []);
      if (messages.length >= 2) {
        const result = await summarizeSession({ messages, profile });
        summary = result.summary;
        summaryGenerated = result.generated;
        summarizedOne = true;
        if (result.usage) {
          await logAgentRun({
            userId,
            sessionId: session.id,
            nodeName: "SessionSummarizer",
            provider: "venice",
            tokens: result.usage.totalTokens,
            latencyMs: 0,
            costEstimate: result.costUsd ?? 0
          });
        }
      }
    }

    const updated = await endSession(session.id, durationSec, summary, userId, {
      endedAt,
      autoClosed: true,
      summaryGenerated
    });
    if (updated) closed.push(updated);
  }

  return closed;
}

export interface FinishSessionInput {
  userId: string;
  sessionId: string;
  clientDurationSec?: number;
  clientSummary?: string;
}

/**
 * End a session properly: server-side duration, a model-written summary when the client
 * did not supply a meaningful one, and a tick on today's plan item.
 */
export async function finishSession(input: FinishSessionInput) {
  const session = await getSessionForUser(input.userId, input.sessionId);
  if (!session) return null;
  if (session.endedAt) return session;

  const durationSec = estimateSessionDurationSec(session, { clientDurationSec: input.clientDurationSec });
  const hasActivity = (session.metrics?.messageCount ?? 0) > 0;

  let summary = input.clientSummary?.trim();
  let summaryGenerated = false;

  if (isPlaceholderSummary(summary)) {
    if (hasActivity) {
      const [messages, profile] = await Promise.all([
        listSessionMessages(input.sessionId),
        getProfile(input.userId).catch(() => null)
      ]);
      const result = await summarizeSession({ messages, profile });
      summary = result.summary;
      summaryGenerated = result.generated;
      if (result.usage) {
        await logAgentRun({
          userId: input.userId,
          sessionId: input.sessionId,
          nodeName: "SessionSummarizer",
          provider: "venice",
          tokens: result.usage.totalTokens,
          latencyMs: 0,
          costEstimate: result.costUsd ?? 0
        });
      }
    } else if (session.metrics?.tonePracticeAttempts?.length) {
      summary = `Tone drill: ${session.metrics.tonePracticeAttempts.length} attempts`;
    } else {
      summary = "Opened without practising";
    }
  }

  const ended = await endSession(input.sessionId, durationSec, summary, input.userId, { summaryGenerated });
  if (ended && (hasActivity || (session.metrics?.tonePracticeAttempts?.length ?? 0) > 0)) {
    await markPlanProgress(input.userId, { sessionId: input.sessionId, summary });
  }
  return ended;
}
