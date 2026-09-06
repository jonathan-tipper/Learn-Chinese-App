import { describe, expect, it } from "vitest";
import {
  activeDaysFromSessions,
  computeStreakDays,
  estimateSessionDurationSec,
  isStaleSession
} from "@/server/store/sessionActivity";
import { isLegacyCard, repairLegacyCard } from "@/server/store/legacyCards";
import type { SessionRecord } from "@/lib/types";

function session(partial: Partial<SessionRecord>): SessionRecord {
  return {
    id: "s",
    userId: "u",
    mode: "daily",
    startedAt: "2026-09-01T10:00:00.000Z",
    ...partial
  };
}

describe("session activity", () => {
  it("credits active time from message activity instead of trusting the client", () => {
    const record = session({
      metrics: { messageCount: 4, lastActivityAt: "2026-09-01T10:08:00.000Z" }
    });
    expect(estimateSessionDurationSec(record, { clientDurationSec: 60 })).toBe(8 * 60 + 60);
  });

  it("falls back to the client duration only when there was no activity", () => {
    expect(estimateSessionDurationSec(session({ metrics: {} }), { clientDurationSec: 150 })).toBe(150);
    expect(estimateSessionDurationSec(session({ metrics: {} }))).toBe(0);
  });

  it("caps runaway durations", () => {
    const record = session({ metrics: { messageCount: 1, lastActivityAt: "2026-09-02T10:00:00.000Z" } });
    expect(estimateSessionDurationSec(record)).toBe(3 * 60 * 60);
  });

  it("detects abandoned sessions after 30 minutes without activity", () => {
    const now = Date.parse("2026-09-01T10:45:00.000Z");
    expect(isStaleSession(session({}), now)).toBe(true);
    expect(isStaleSession(session({ metrics: { lastActivityAt: "2026-09-01T10:30:00.000Z" } }), now)).toBe(false);
    expect(isStaleSession(session({ endedAt: "2026-09-01T10:05:00.000Z" }), now)).toBe(false);
  });

  it("counts open sessions with messages as active days and keeps today's streak alive", () => {
    const days = activeDaysFromSessions([
      session({ startedAt: "2026-08-30T09:00:00.000Z", endedAt: "2026-08-30T09:10:00.000Z" }),
      session({ startedAt: "2026-08-31T09:00:00.000Z", metrics: { messageCount: 2, lastActivityAt: "2026-08-31T09:05:00.000Z" } }),
      session({ startedAt: "2026-08-29T09:00:00.000Z" })
    ]);
    expect(Array.from(days).sort()).toEqual(["2026-08-30", "2026-08-31"]);
    expect(computeStreakDays(days, new Date("2026-09-01T08:00:00.000Z"))).toBe(2);
    expect(computeStreakDays(days, new Date("2026-09-02T08:00:00.000Z"))).toBe(0);
  });
});

describe("legacy card repair", () => {
  it("splits pre-fix cards into a hanzi prompt and pinyin/English answer", () => {
    const legacy = {
      prompt: "Translate or use: 新年快乐 (xīn nián kuài lè) - Happy New Year",
      answer: "新年快乐 (xīn nián kuài lè) - Happy New Year"
    };
    expect(isLegacyCard(legacy)).toBe(true);
    const { card, repaired } = repairLegacyCard(legacy);
    expect(repaired).toBe(true);
    expect(card).toEqual({ prompt: "新年快乐", answer: "xīn nián kuài lè — Happy New Year" });
  });

  it("leaves healthy cards untouched", () => {
    const healthy = { prompt: "茶", answer: "chá — tea" };
    expect(isLegacyCard(healthy)).toBe(false);
    expect(repairLegacyCard(healthy)).toEqual({ card: healthy, repaired: false });
  });
});

describe("missing relation detection", () => {
  it("recognises missing tables and columns from PostgREST and Postgres", async () => {
    const { isMissingRelationError } = await import("@/server/store/errors");
    expect(isMissingRelationError({ code: "42703", message: "column agent_runs.tokens does not exist" })).toBe(true);
    expect(isMissingRelationError({ code: "PGRST205", message: "Could not find the table 'learn_chinese.learning_plans' in the schema cache" })).toBe(true);
    expect(isMissingRelationError({ code: "42P01", message: "relation x does not exist" })).toBe(true);
    expect(isMissingRelationError({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(isMissingRelationError(new Error("network down"))).toBe(false);
  });
});
