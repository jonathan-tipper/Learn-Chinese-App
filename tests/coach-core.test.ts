import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as chatPost } from "@/app/api/chat/route";
import { GET as planGet, POST as planRegenerate } from "@/app/api/plan/route";
import { GET as charactersList } from "@/app/api/characters/route";
import { GET as characterCard } from "@/app/api/characters/[entry]/route";
import { POST as sessionEnd } from "@/app/api/session/end/route";
import { POST as sessionStart } from "@/app/api/session/start/route";
import { POST as onboardingSave } from "@/app/api/onboarding/save/route";
import { GET as progressSummary } from "@/app/api/progress/summary/route";
import { GET as continuityGet } from "@/app/api/progress/continuity/route";
import { env } from "@/lib/env";
import { normalizeMemoryCandidates } from "@/server/agents/memoryCurator";
import {
  addDays,
  buildFallbackPlan,
  localDateString,
  normalizePlanPayload,
  planCoversDate
} from "@/server/agents/curriculumPlanner";
import { normalizeCharacterCard, isValidCharacterEntry } from "@/server/agents/characterCards";
import { historyFromMessages } from "@/server/agents/langgraphRuntime";
import { buildTutorMessages, buildTutorSystemPrompt } from "@/server/agents/tutorModel";
import { closeStaleSessions } from "@/server/agents/sessionLifecycle";
import { buildAnswerSafeHints, buildCardTags, chineseSentenceFromExample } from "@/server/store/srs";
import {
  appendMessage,
  createSession,
  getAllCards,
  getSessionForUser,
  listMemories,
  listSessionsByUser
} from "@/server/store";
import { resetInMemoryStore } from "@/server/store/inMemory";
import { characterCardPayload, installVeniceMock, parseSseEvents, plannerPayload, tutorStructured } from "./helpers/venice-mock";

const userId = "11111111-1111-4111-8111-111111111111";
const originalFetch = globalThis.fetch;

function jsonRequest(url: string, method: string, body?: unknown, requestUserId = userId) {
  const headers = new Headers({ "x-user-id": requestUserId });
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
}

async function saveProfile() {
  const response = await onboardingSave(jsonRequest("http://localhost/api/onboarding/save", "POST", {
    goals: ["ordering food at restaurants", "speaking to family"],
    interests: ["chinese food", "family"],
    level: "beginner",
    timezone: "Europe/London",
    coachStyle: "friendly",
    minutesPerDay: 10
  }));
  expect(response.status).toBe(200);
  return response.json();
}

describe("coach core", () => {
  beforeEach(() => {
    resetInMemoryStore();
    (env as { veniceApiKey: string }).veniceApiKey = "test-venice-key";
    (env as { veniceBaseUrl: string }).veniceBaseUrl = "https://api.venice.ai/api/v1";
    (env as { veniceSimpleModel: string }).veniceSimpleModel = "zai-org-glm-4.7";
    (env as { veniceComplexModel: string }).veniceComplexModel = "zai-org-glm-5";
    installVeniceMock();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("prompt construction", () => {
    it("uses coach style, level, memories, plan focus and full conversation history", () => {
      const messages = buildTutorMessages({
        message: "How do I say time for bed?",
        history: [
          { role: "user", content: "Teach me bath time phrases" },
          { role: "assistant", content: "洗澡 (xǐzǎo) means to bathe." }
        ],
        memoryContext: ["Toddler at home: Has a toddler."],
        profile: {
          userId,
          goals: ["family"],
          interests: ["cooking"],
          level: "beginner",
          timezone: "UTC",
          coachStyle: "concise",
          minutesPerDay: 10,
          preferredSimpleModel: "a",
          preferredComplexModel: "b"
        },
        planFocus: "Today: Bedtime routines — commands with 吧.",
        weakAreas: ["tone pairs 2/4 contrast"],
        dueCards: 3,
        intent: "quiz_me"
      });

      const system = messages[0].content;
      expect(system).toContain("Tone: minimal");
      expect(system).toContain("Level: beginner");
      expect(system).toContain("Toddler at home");
      expect(system).toContain("Bedtime routines");
      expect(system).toContain("tone pairs 2/4 contrast");
      expect(system).toContain("3 review cards due");
      expect(messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
      expect(messages[2].content).toContain("洗澡");
      expect(messages[3].content).toContain("QUIZZED");
    });

    it("never recites memories and defaults to a friendly beginner coach without a profile", () => {
      const system = buildTutorSystemPrompt({ message: "hi", memoryContext: [] });
      expect(system).toContain("Tone: warm");
      expect(system).toContain("Level: beginner");
      expect(system).not.toContain("Long-term memories");
    });

    it("drops the message currently being answered from the history", () => {
      const history = historyFromMessages(
        [
          { role: "user", content: "a" },
          { role: "assistant", content: "b" },
          { role: "system", content: "ignored" },
          { role: "user", content: "current" }
        ],
        "current"
      );
      expect(history).toEqual([{ role: "user", content: "a" }, { role: "assistant", content: "b" }]);
    });
  });

  describe("chat turn", () => {
    it("streams the answer, emits structured details, saves cards with cloze hints and curates memories", async () => {
      await saveProfile();
      const start = await sessionStart(jsonRequest("http://localhost/api/session/start", "POST", { mode: "daily" }));
      const { sessionId } = await start.json();

      const response = await chatPost(jsonRequest("http://localhost/api/chat", "POST", {
        sessionId,
        message: "My toddler loves tea time. How do I order tea politely for us?",
        modelSelectionMode: "auto"
      }));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      const events = parseSseEvents(await response.text());
      const deltas = events.filter((event) => event.type === "delta").map((event) => event.content as string);
      expect(deltas.length).toBeGreaterThan(1);
      expect(deltas.join("")).toBe(tutorStructured.answer);

      const structuredEvent = events.find((event) => event.type === "structured");
      expect((structuredEvent?.structured as { topic?: string }).topic).toBe("ordering drinks");

      const finalEvent = events.find((event) => event.type === "final");
      expect(finalEvent).toBeTruthy();
      expect(finalEvent?.createdReviewCards).toBe(2);
      expect((finalEvent?.memoriesSaved as Array<{ key: string }>).map((memory) => memory.key)).toEqual(["Toddler at home"]);
      expect(finalEvent?.nodesExecuted).toEqual(expect.arrayContaining(["ContextLoader", "Planner", "TutorResponse", "SRSExtract", "MemoryWrite"]));

      const cards = await getAllCards(userId);
      const tea = cards.find((card) => card.prompt === "茶");
      expect(tea?.hints[0]).toBe("Fill the gap: 请给我一杯＿＿。");
      expect(tea?.hints[1]).toBe("Came up while practising: ordering drinks");
      expect(tea?.tags).toEqual(["auto-generated", "ordering drinks"]);

      const memories = await listMemories(userId);
      expect(memories).toHaveLength(1);
      expect(memories[0].type).toBe("topic");

      const session = await getSessionForUser(userId, sessionId);
      expect(session?.metrics?.messageCount).toBe(2);
      expect(session?.metrics?.lastActivityAt).toBeTruthy();
    });

    it("does not call the memory curator for short messages", async () => {
      const { calls } = installVeniceMock();
      const session = await createSession(userId, "daily");
      const response = await chatPost(jsonRequest("http://localhost/api/chat", "POST", {
        sessionId: session.id,
        message: "hello",
        modelSelectionMode: "auto"
      }));
      await response.text();
      const curatorCalls = calls.filter((call) =>
        JSON.stringify(call.messages).includes("long-term memory of a Mandarin coaching app")
      );
      expect(curatorCalls).toHaveLength(0);
      expect(await listMemories(userId)).toHaveLength(0);
    });

    it("rejects chatting in a session that has already ended", async () => {
      const session = await createSession(userId, "daily");
      await sessionEnd(jsonRequest("http://localhost/api/session/end", "POST", { sessionId: session.id, durationSec: 30 }));
      const response = await chatPost(jsonRequest("http://localhost/api/chat", "POST", {
        sessionId: session.id,
        message: "still there?",
        modelSelectionMode: "auto"
      }));
      expect(response.status).toBe(409);
    });
  });

  describe("session lifecycle", () => {
    it("writes a model summary and server-side duration at session end and feeds continuity", async () => {
      const session = await createSession(userId, "daily");
      await appendMessage(session.id, "user", "Teach me how to order tea politely.");
      await appendMessage(session.id, "assistant", "请给我一杯茶。");

      const response = await sessionEnd(jsonRequest("http://localhost/api/session/end", "POST", {
        sessionId: session.id,
        durationSec: 5000,
        summary: "Session complete"
      }));
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.summary).toContain("请 (qǐng)");
      expect(data.metrics.durationSec).toBeGreaterThanOrEqual(60);
      expect(data.metrics.durationSec).toBeLessThan(5000);

      const continuity = await continuityGet(jsonRequest("http://localhost/api/progress/continuity", "GET"));
      const continuityData = await continuity.json();
      expect(continuityData.continuity.summary).toContain("请 (qǐng)");
      expect(continuityData.continuity.when).toBe("today");
    });

    it("closes abandoned sessions when a new one starts and counts them toward progress", async () => {
      const stale = await createSession(userId, "daily");
      await appendMessage(stale.id, "user", "你好");
      await appendMessage(stale.id, "assistant", "你好！");
      const staleRecord = (await listSessionsByUser(userId))[0];
      staleRecord.startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      staleRecord.metrics!.lastActivityAt = new Date(Date.now() - 100 * 60 * 1000).toISOString();

      const closed = await closeStaleSessions(userId);
      expect(closed).toHaveLength(1);
      expect(closed[0].metrics?.autoClosed).toBe(true);
      expect(closed[0].durationSec).toBeGreaterThan(0);

      const summary = await (await progressSummary(jsonRequest("http://localhost/api/progress/summary", "GET"))).json();
      expect(summary.summary.totalSessions).toBe(1);
      expect(summary.summary.streakDays).toBe(1);
    });

    it("keeps an open session with recent activity", async () => {
      const active = await createSession(userId, "daily");
      await appendMessage(active.id, "user", "你好");
      expect(await closeStaleSessions(userId)).toHaveLength(0);
    });
  });

  describe("curriculum planner", () => {
    it("normalizes model output into a dated 7-day plan", () => {
      const plan = normalizePlanPayload(plannerPayload, { startDate: "2026-09-06", profile: null });
      expect(plan.items).toHaveLength(7);
      expect(plan.items[0].date).toBe("2026-09-06");
      expect(plan.items[6].date).toBe("2026-09-12");
      expect(plan.items[0].canDo).toBe("I can order a drink politely");
      expect(plan.items[0].modalities).toEqual(["speaking", "review"]);
      expect(plan.items.every((item) => item.status === "planned")).toBe(true);
    });

    it("pads short plans and falls back to a template without the model", () => {
      const short = normalizePlanPayload({ items: plannerPayload.items.slice(0, 2) }, { startDate: "2026-09-06", profile: null });
      expect(short.items).toHaveLength(7);
      expect(short.items[6].title).toBe("Weekly review");

      const fallback = buildFallbackPlan({ startDate: "2026-09-06", profile: null, weakAreas: ["tone pairs"], dueCards: 4 });
      expect(fallback.items).toHaveLength(7);
      expect(fallback.items[2].lessonFocus).toContain("tone pairs");
    });

    it("computes dates in the learner's timezone and detects coverage", () => {
      expect(localDateString(new Date("2026-09-06T23:30:00.000Z"), "Asia/Shanghai")).toBe("2026-09-07");
      expect(localDateString(new Date("2026-09-06T23:30:00.000Z"), "Not/AZone")).toBe("2026-09-06");
      expect(addDays("2026-09-30", 2)).toBe("2026-10-02");
      expect(planCoversDate({ startDate: "2026-09-06" }, "2026-09-12")).toBe(true);
      expect(planCoversDate({ startDate: "2026-09-06" }, "2026-09-13")).toBe(false);
    });

    it("generates, persists and reuses a plan through the API, and session start uses today's item", async () => {
      const { calls } = installVeniceMock();
      const onboarding = await saveProfile();
      expect(onboarding.firstWeekPlan[0]).toContain("Focus day 1");

      const first = await (await planGet(jsonRequest("http://localhost/api/plan", "GET"))).json();
      expect(first.plan.items).toHaveLength(7);
      expect(first.today.day).toBe(1);

      const plannerCallsBefore = calls.filter((call) => JSON.stringify(call.messages).includes("Design the next 7 days")).length;
      const second = await (await planGet(jsonRequest("http://localhost/api/plan", "GET"))).json();
      expect(second.plan.id).toBe(first.plan.id);
      const plannerCallsAfter = calls.filter((call) => JSON.stringify(call.messages).includes("Design the next 7 days")).length;
      expect(plannerCallsAfter).toBe(plannerCallsBefore);

      const start = await (await sessionStart(jsonRequest("http://localhost/api/session/start", "POST", { mode: "daily" }))).json();
      expect(start.planSnippet).toBe("Today: Focus day 1 — Lesson focus 1.");

      const regenerated = await (await planRegenerate(jsonRequest("http://localhost/api/plan", "POST"))).json();
      expect(regenerated.plan.id).not.toBe(first.plan.id);
      expect(regenerated.generated).toBe(true);
    });

    it("marks today's plan item complete after a real session", async () => {
      await saveProfile();
      await planGet(jsonRequest("http://localhost/api/plan", "GET"));
      const start = await (await sessionStart(jsonRequest("http://localhost/api/session/start", "POST", { mode: "daily" }))).json();
      await appendMessage(start.sessionId, "user", "你好");
      await appendMessage(start.sessionId, "assistant", "你好！");
      await sessionEnd(jsonRequest("http://localhost/api/session/end", "POST", { sessionId: start.sessionId, durationSec: 120 }));

      const plan = await (await planGet(jsonRequest("http://localhost/api/plan", "GET"))).json();
      expect(plan.today.status).toBe("completed");
      expect(plan.today.completedSessionId).toBe(start.sessionId);
    });
  });

  describe("memory curator", () => {
    it("drops duplicates and malformed candidates", () => {
      const accepted = normalizeMemoryCandidates(
        {
          memories: [
            { type: "topic", key: "Toddler at home", value: "Has a toddler." },
            { type: "topic", key: "toddler at home", value: "Different wording, same key." },
            { type: "goal", key: "Trip", value: "Visiting Shanghai in October." },
            { type: "goal", key: "Trip plans", value: "Visiting Shanghai in October." },
            { type: "nonsense", key: "x", value: "y" },
            { type: "preference", key: "", value: "empty key" }
          ]
        },
        [{ key: "Toddler at home", value: "Has a toddler." }]
      );
      expect(accepted).toEqual([{ type: "goal", key: "Trip", value: "Visiting Shanghai in October." }]);
    });

    it("returns nothing for unparseable output", () => {
      expect(normalizeMemoryCandidates("not json", [])).toEqual([]);
      expect(normalizeMemoryCandidates({ memories: "nope" }, [])).toEqual([]);
    });
  });

  describe("review hints", () => {
    it("builds cloze hints from the example the word appeared in", () => {
      expect(chineseSentenceFromExample("请给我一杯茶。 (Qǐng gěi wǒ yì bēi chá.) — Please give me a cup of tea.")).toBe("请给我一杯茶。");
      expect(chineseSentenceFromExample("Please — 请")).toBe("");
      expect(buildAnswerSafeHints("茶", { examples: ["请给我一杯茶。 (Qǐng gěi wǒ yì bēi chá.) — Please give me a cup of tea."], tags: ["ordering drinks"] }))
        .toEqual(["Fill the gap: 请给我一杯＿＿。", "Came up while practising: ordering drinks"]);
      expect(buildAnswerSafeHints("茶", { examples: ["茶 (chá) — tea"] })).toEqual(["Recall context from your last session"]);
      expect(buildCardTags({ tags: ["Ordering Drinks", "", "auto-generated"] })).toEqual(["auto-generated", "ordering drinks"]);
    });
  });

  describe("character cards", () => {
    it("validates entries", () => {
      expect(isValidCharacterEntry("茶")).toBe(true);
      expect(isValidCharacterEntry("新年快乐")).toBe(true);
      expect(isValidCharacterEntry("tea")).toBe(false);
      expect(isValidCharacterEntry("我今天想点一杯茶")).toBe(false);
    });

    it("normalizes model output per character and drops the entry from common words", () => {
      const card = normalizeCharacterCard(characterCardPayload, "茶", { generatedBy: "test-model", generatedAt: "2026-09-06T00:00:00.000Z" });
      expect(card.characters).toHaveLength(1);
      expect(card.characters[0].radical).toBe("艹");
      expect(card.commonWords.map((word) => word.hanzi)).toEqual(["绿茶", "茶杯"]);
      expect(card.generatedBy).toBe("test-model");
    });

    it("lists studied entries and generates then caches a card through the API", async () => {
      const { calls } = installVeniceMock();
      const session = await createSession(userId, "daily");
      const chat = await chatPost(jsonRequest("http://localhost/api/chat", "POST", {
        sessionId: session.id,
        message: "Teach me how to order tea politely please.",
        modelSelectionMode: "auto"
      }));
      await chat.text();

      const list = await (await charactersList(jsonRequest("http://localhost/api/characters", "GET"))).json();
      expect(list.entries.map((entry: { entry: string }) => entry.entry)).toEqual(expect.arrayContaining(["茶", "请"]));
      expect(list.entries.find((entry: { entry: string }) => entry.entry === "茶").pinyin).toBe("chá");

      const params = { params: Promise.resolve({ entry: encodeURIComponent("茶") }) };
      const first = await (await characterCard(jsonRequest("http://localhost/api/characters/%E8%8C%B6", "GET"), params)).json();
      expect(first.cached).toBe(false);
      expect(first.card.entry).toBe("茶");
      expect(first.card.characters[0].mnemonic).toContain("tea");

      const cardCalls = () => calls.filter((call) => JSON.stringify(call.messages).includes("Create a learning card")).length;
      const before = cardCalls();
      const second = await (await characterCard(jsonRequest("http://localhost/api/characters/%E8%8C%B6", "GET"), params)).json();
      expect(second.cached).toBe(true);
      expect(cardCalls()).toBe(before);

      const invalid = await characterCard(jsonRequest("http://localhost/api/characters/tea", "GET"), { params: Promise.resolve({ entry: "tea" }) });
      expect(invalid.status).toBe(400);
    });
  });
});

describe("character card payload coercion", () => {
  it("accepts common alias key names from different models", async () => {
    const { normalizeCharacterCard } = await import("@/server/agents/characterCards");
    const card = normalizeCharacterCard({
      pinyin: "xǐzǎo",
      english: "to bathe",
      breakdown: [
        { character: "洗", pinyin: "xǐ", definition: "wash", radical: { symbol: "氵", meaning: "water" }, composition: "water + 先", memoryAid: "Water first, then clean.", strokes: "9" },
        { character: "澡", pinyin: "zǎo", definition: "bathe", radical: "氵", radical_meaning: "water", structure: "water + 喿", story: "Noisy birds splashing in water.", stroke_count: 16 }
      ],
      words: [{ word: "洗澡间", pinyin: "xǐzǎojiān", meaning: "bathroom" }],
      example: { chinese: "该洗澡了。", pinyin: "Gāi xǐzǎo le.", translation: "Time for a bath." },
      tip: "Use 洗澡 for the whole act of bathing."
    }, "洗澡", { generatedBy: "test" });

    expect(card.meaning).toBe("to bathe");
    expect(card.characters.map((c) => c.radical)).toEqual(["氵", "氵"]);
    expect(card.characters[0].strokeCount).toBe(9);
    expect(card.characters[1].mnemonic).toContain("birds");
    expect(card.commonWords[0].hanzi).toBe("洗澡间");
    expect(card.exampleSentence.hanzi).toBe("该洗澡了。");
    expect(card.usageTip).toContain("洗澡");
  });
});
