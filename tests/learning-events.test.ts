import { beforeEach, describe, expect, it } from "vitest";
import {
  buildLearningEvent,
  summarizeLearningEvents,
  type LearningEventInput
} from "@/lib/learning-events";
import {
  addSrsCards,
  createSession,
  endSession,
  gradeCard,
  listLearningEvents
} from "@/server/store";
import { resetInMemoryStore } from "@/server/store/inMemory";

const userId = "00000000-0000-4000-8000-000000000001";

describe("learning events", () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    resetInMemoryStore();
  });

  it("normalizes allowlisted event metadata and rejects invalid payloads", () => {
    expect(buildLearningEvent({
      userId,
      sessionId: "session-1",
      name: "session_ended",
      occurredAt: "2026-07-01T09:00:00.000Z",
      metadata: { durationSec: 180, summary: "private learning content" }
    })).toMatchObject({
      userId,
      sessionId: "session-1",
      name: "session_ended",
      metadata: { durationSec: 180 }
    });

    expect(() => buildLearningEvent({
      userId,
      name: "session_ended",
      occurredAt: "2026-07-01T09:00:00.000Z",
      metadata: { durationSec: -1 }
    })).toThrow("Invalid learning event metadata");
  });

  it("computes D1/D7 cohort retention, duration, and review completion", () => {
    const inputs: LearningEventInput[] = [
      { userId: "u1", name: "session_started", occurredAt: "2026-07-01T09:00:00.000Z", metadata: { mode: "daily" } },
      { userId: "u1", name: "session_ended", occurredAt: "2026-07-01T09:03:00.000Z", metadata: { durationSec: 180 } },
      { userId: "u1", name: "session_started", occurredAt: "2026-07-02T09:00:00.000Z", metadata: { mode: "daily" } },
      { userId: "u1", name: "review_completed", occurredAt: "2026-07-08T09:00:00.000Z", metadata: { grade: "good" } },
      { userId: "u2", name: "session_started", occurredAt: "2026-07-01T10:00:00.000Z", metadata: { mode: "quick" } },
      { userId: "u2", name: "session_ended", occurredAt: "2026-07-01T10:01:00.000Z", metadata: { durationSec: 60 } }
    ];
    const events = inputs.map(buildLearningEvent);

    expect(summarizeLearningEvents(events, "2026-07-08T23:59:59.000Z")).toEqual({
      retention: {
        d1: { eligibleUsers: 2, retainedUsers: 1, rate: 0.5 },
        d7: { eligibleUsers: 2, retainedUsers: 1, rate: 0.5 }
      },
      sessionsEnded: 2,
      averageSessionDurationSec: 120,
      reviewCompletions: 1
    });
  });

  it("records authenticated session and review behavior without changing core results", async () => {
    const session = await createSession(userId, "daily");
    const [card] = await addSrsCards(userId, ["茶 (chá) - tea"]);

    expect(await gradeCard(userId, card.id, "good")).toMatchObject({ id: card.id, lastResult: "good" });
    expect(await endSession(session.id, 180, "Practiced tea", userId)).toMatchObject({
      id: session.id,
      durationSec: 180
    });
    await endSession(session.id, 180, "Retry", userId);

    expect(await listLearningEvents(userId)).toEqual([
      expect.objectContaining({ name: "session_started", sessionId: session.id, metadata: { mode: "daily" } }),
      expect.objectContaining({ name: "review_completed", metadata: { grade: "good" } }),
      expect.objectContaining({ name: "session_ended", sessionId: session.id, metadata: { durationSec: 180 } })
    ]);
    expect(await listLearningEvents("00000000-0000-4000-8000-000000000002")).toEqual([]);
  });
});
