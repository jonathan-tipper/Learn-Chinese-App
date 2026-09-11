import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as dailyReminder } from "@/app/api/push/daily/route";
import { POST as onboardingSave } from "@/app/api/onboarding/save/route";
import { GET as speakingPrompts } from "@/app/api/speaking/prompts/route";
import { POST as speechScore } from "@/app/api/speech/score/route";
import { GET as progressSummary } from "@/app/api/progress/summary/route";
import { env } from "@/lib/env";
import { buildReminderMessage, collectReminderCandidates, localHour } from "@/server/agents/dailyReminder";
import { normalizeSpeakingPrompts } from "@/server/agents/speakingPrompts";
import { appendMessage, createSession, getProfile, saveProfile } from "@/server/store";
import { resetInMemoryStore } from "@/server/store/inMemory";
import { installVeniceMock } from "./helpers/venice-mock";

const userId = "11111111-1111-4111-8111-111111111111";
const originalFetch = globalThis.fetch;

function jsonRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  const requestHeaders = new Headers({ "x-user-id": userId, ...headers });
  if (body !== undefined) requestHeaders.set("content-type", "application/json");
  return new Request(url, { method, headers: requestHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
}

const baseProfile = {
  userId,
  goals: ["family"],
  interests: ["food"],
  level: "beginner" as const,
  timezone: "Europe/London",
  coachStyle: "friendly" as const,
  minutesPerDay: 10,
  preferredSimpleModel: "a",
  preferredComplexModel: "b"
};

describe("speaking practice", () => {
  beforeEach(() => {
    resetInMemoryStore();
    (env as { veniceApiKey: string }).veniceApiKey = "test-venice-key";
    (env as { veniceBaseUrl: string }).veniceBaseUrl = "https://api.venice.ai/api/v1";
    (env as { veniceSimpleModel: string }).veniceSimpleModel = "zai-org-glm-4.7";
    (env as { veniceComplexModel: string }).veniceComplexModel = "zai-org-glm-5";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("scores a spoken attempt, records it against the session and surfaces weak areas after repeats", async () => {
    installVeniceMock();
    const session = await createSession(userId, "quick");

    const first = await (await speechScore(jsonRequest("http://localhost/api/speech/score", "POST", {
      target: "我想买茶", transcript: "我想卖茶", sessionId: session.id
    }))).json();
    expect(first.score).toBe(88);
    expect(first.toneContrastsMissed).toEqual(["3/4"]);
    expect(first.weakAreas).toEqual(["tone pairs 3/4 contrast"]);

    await speechScore(jsonRequest("http://localhost/api/speech/score", "POST", {
      target: "我想买茶", transcript: "我想卖茶", sessionId: session.id
    }));

    const summary = await (await progressSummary(jsonRequest("http://localhost/api/progress/summary", "GET"))).json();
    expect(summary.summary.weakAreas).toContain("tone pairs 3/4 contrast");
    expect(summary.summary.totalSessions).toBe(1);
  });

  it("rejects targets without Chinese characters and unknown sessions", async () => {
    const bad = await speechScore(jsonRequest("http://localhost/api/speech/score", "POST", { target: "hello", transcript: "hello" }));
    expect(bad.status).toBe(400);
    const missing = await speechScore(jsonRequest("http://localhost/api/speech/score", "POST", {
      target: "你好", transcript: "你好", sessionId: "33333333-3333-4333-8333-333333333333"
    }));
    expect(missing.status).toBe(400);
  });

  it("normalizes speaking prompts and drops non-Chinese or duplicate ones", () => {
    const prompts = normalizeSpeakingPrompts({
      prompts: [
        { hanzi: "该洗澡了。", pinyin: "Gāi xǐzǎo le.", english: "Time for a bath." },
        { hanzi: "该洗澡了。", pinyin: "dup", english: "dup" },
        { hanzi: "Hello 你好", pinyin: "x", english: "y" },
        { hanzi: "我们吃饭吧！", pinyin: "Wǒmen chīfàn ba!", english: "Let's eat!" }
      ]
    }, "plan");
    expect(prompts.map((p) => p.hanzi)).toEqual(["该洗澡了。", "我们吃饭吧！"]);
    expect(prompts[0].source).toBe("plan");
  });

  it("serves fallback prompts without a model and caches generated ones per day", async () => {
    (env as { veniceApiKey: string }).veniceApiKey = "";
    const fallback = await (await speakingPrompts(jsonRequest("http://localhost/api/speaking/prompts", "GET"))).json();
    expect(fallback.source).toBe("fallback");
    expect(fallback.prompts.length).toBeGreaterThan(1);

    (env as { veniceApiKey: string }).veniceApiKey = "test-venice-key";
    const { calls } = installVeniceMock({
      tutor: { prompts: [{ hanzi: "请给我一杯茶。", pinyin: "Qǐng gěi wǒ yì bēi chá.", english: "Please give me a cup of tea." }] }
    });
    const generated = await (await speakingPrompts(jsonRequest("http://localhost/api/speaking/prompts", "GET"))).json();
    expect(generated.cached).toBe(false);
    expect(generated.prompts[0].hanzi).toBe("请给我一杯茶。");
    const again = await (await speakingPrompts(jsonRequest("http://localhost/api/speaking/prompts", "GET"))).json();
    expect(again.cached).toBe(true);
    expect(calls.filter((call) => JSON.stringify(call.messages).includes("speaking practice"))).toHaveLength(1);
  });
});

describe("daily reminders", () => {
  beforeEach(() => {
    resetInMemoryStore();
    (env as { cronSecret: string }).cronSecret = "cron-secret";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("computes local hours and builds messages from the plan and review load", () => {
    expect(localHour(new Date("2026-09-11T18:30:00.000Z"), "Europe/London")).toBe(19);
    expect(localHour(new Date("2026-09-11T18:30:00.000Z"), "Asia/Shanghai")).toBe(2);
    expect(localHour(new Date("2026-09-11T18:30:00.000Z"), "Nope/Zone")).toBe(18);

    const withPlan = buildReminderMessage({
      profile: { ...baseProfile, reminderHour: 19 },
      planItem: { day: 2, date: "2026-09-11", title: "Bath time", canDo: "I can say it's time for a bath", lessonFocus: "", reviewFocus: "", modalities: ["speaking"], reason: "", estimatedMinutes: 10, status: "planned" },
      dueCards: 3,
      streakDays: 2
    });
    expect(withPlan.title).toBe("Today: Bath time");
    expect(withPlan.body).toContain("3 cards due");
    expect(withPlan.body).toContain("Streak: 2 days");
    expect(withPlan.url).toBe("/chat");

    const reviewOnly = buildReminderMessage({ profile: baseProfile, planItem: null, dueCards: 1, streakDays: 0 });
    expect(reviewOnly.url).toBe("/review");
  });

  it("only nudges learners whose hour matches, who have not practised, once per day", async () => {
    const now = new Date("2026-09-11T18:30:00.000Z"); // 19:30 London
    await saveProfile({ ...baseProfile, reminderHour: 19 });
    await saveProfile({ ...baseProfile, userId: "22222222-2222-4222-8222-222222222222", reminderHour: 8 });
    await saveProfile({ ...baseProfile, userId: "44444444-4444-4444-8444-444444444444", reminderHour: 19, lastReminderDate: "2026-09-11" });
    const practised = "55555555-5555-4555-8555-555555555555";
    await saveProfile({ ...baseProfile, userId: practised, reminderHour: 19 });
    const session = await createSession(practised, "daily");
    await appendMessage(session.id, "user", "你好");

    const candidates = await collectReminderCandidates(now);
    expect(candidates.map((candidate) => candidate.profile.userId)).toEqual([userId]);
    expect(candidates[0].localDate).toBe("2026-09-11");
  });

  it("guards the cron route and supports dry runs", async () => {
    await saveProfile({ ...baseProfile, reminderHour: new Date().getUTCHours(), timezone: "UTC" });

    const denied = await dailyReminder(new Request("http://localhost/api/push/daily"));
    expect(denied.status).toBe(401);

    const dry = await dailyReminder(new Request("http://localhost/api/push/daily?dryRun=1", {
      headers: { authorization: "Bearer cron-secret" }
    }));
    expect(dry.status).toBe(200);
    const data = await dry.json();
    expect(data.dryRun).toBe(true);
    expect(data.candidates.map((candidate: { userId: string }) => candidate.userId)).toEqual([userId]);
  });

  it("stores the reminder hour from onboarding", async () => {
    const response = await onboardingSave(jsonRequest("http://localhost/api/onboarding/save", "POST", {
      goals: ["travel"], interests: [], level: "beginner", timezone: "UTC", coachStyle: "friendly", minutesPerDay: 10, reminderHour: 20
    }));
    expect(response.status).toBe(200);
    expect((await getProfile(userId))?.reminderHour).toBe(20);
  });
});
