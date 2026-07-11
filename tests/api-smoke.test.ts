import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as chatPost } from "@/app/api/chat/route";
import { DELETE as memoryDelete } from "@/app/api/memory/delete/route";
import { GET as memoryList } from "@/app/api/memory/list/route";
import { GET as modelsGet } from "@/app/api/models/route";
import { POST as onboardingSave } from "@/app/api/onboarding/save/route";
import { GET as progressContinuity } from "@/app/api/progress/continuity/route";
import { GET as progressSummary } from "@/app/api/progress/summary/route";
import { POST as sessionEnd } from "@/app/api/session/end/route";
import { POST as sessionStart } from "@/app/api/session/start/route";
import { POST as srsGrade } from "@/app/api/srs/grade/route";
import { GET as srsNext } from "@/app/api/srs/next/route";
import { POST as tonePracticeAttemptsPost } from "@/app/api/tone-practice/attempts/route";
import { POST as voiceTts } from "@/app/api/voice/tts/route";
import { env } from "@/lib/env";
import { buildTonePracticeAttempt, TONE_PRACTICE_PROMPTS } from "@/lib/tone-practice";
import { generateTutorStructuredResponse } from "@/server/agents/tutorModel";
import {
  addSrsCards,
  addVocabItems,
  computeProgressSummary,
  createSession,
  endSession,
  getAllCards,
  getSessionAgentUsage,
  logAgentRun,
  listVocabItems
} from "@/server/store";
import { resetInMemoryStore } from "@/server/store/inMemory";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const originalFetch = globalThis.fetch;

function jsonRequest(url: string, method: string, body?: unknown, requestUserId = userId) {
  const headers = new Headers({ "x-user-id": requestUserId });
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }

  return new Request(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

function parseSseFinal(raw: string) {
  const payloads = raw
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => chunk.replace(/^data:\s*/, ""))
    .map((chunk) => JSON.parse(chunk));

  return payloads.find((event) => event.type === "final");
}

describe("API smoke", () => {
  const originalDevAuthFallback = process.env.ALLOW_DEV_AUTH_FALLBACK;

  beforeEach(() => {
    resetInMemoryStore();
    process.env.ALLOW_DEV_AUTH_FALLBACK = originalDevAuthFallback;

    (env as { veniceApiKey: string }).veniceApiKey = "test-venice-key";
    (env as { veniceBaseUrl: string }).veniceBaseUrl = "https://api.venice.ai/api/v1";
    (env as { veniceSimpleModel: string }).veniceSimpleModel = "zai-org-glm-4.7";
    (env as { veniceComplexModel: string }).veniceComplexModel = "zai-org-glm-5";
    (env as { veniceTtsModel: string }).veniceTtsModel = "tts-kokoro";
    (env as { veniceTtsVoice: string }).veniceTtsVoice = "zf_xiaobei";
    delete process.env.ELEVENLABS_API_KEY;

    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.url;

      if (url.includes("/chat/completions")) {
        const structured = {
          answer: "Here is a concise coaching response.",
          keyPoints: ["Polite request pattern"],
          examples: ["我想点一杯茶。 (I want to order a tea.)"],
          microExercise: "Rewrite with 今天.",
          suggestedReviewItems: ["茶 (chá) - tea"]
        };

        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(structured) } }]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      if (url.endsWith("/models")) {
        return new Response(
          JSON.stringify({
            data: [
              { id: "zai-org-glm-4.7" },
              { id: "zai-org-glm-5" },
              { id: "qwen-2.5-72b-instruct" }
            ]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      if (url.includes("/audio/speech")) {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" }
        });
      }

      throw new Error(`Unexpected external fetch in test: ${url}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.ALLOW_DEV_AUTH_FALLBACK = originalDevAuthFallback;
    vi.restoreAllMocks();
  });

  it("runs the core v0.1 flow", async () => {
    const onboardingResponse = await onboardingSave(
      jsonRequest("http://localhost/api/onboarding/save", "POST", {
        goals: ["travel"],
        interests: ["tea"],
        level: "beginner",
        timezone: "UTC",
        coachStyle: "friendly",
        minutesPerDay: 10,
        preferredSimpleModel: "zai-org-glm-4.7",
        preferredComplexModel: "zai-org-glm-5"
      })
    );
    expect(onboardingResponse.status).toBe(200);

    const startResponse = await sessionStart(
      jsonRequest("http://localhost/api/session/start", "POST", { mode: "daily" })
    );
    const startData = await startResponse.json();
    const sessionId = startData.sessionId as string;
    expect(sessionId).toBeTruthy();

    const rememberResponse = await chatPost(
      jsonRequest("http://localhost/api/chat", "POST", {
        sessionId,
        message: "remember topic: tea",
        verifyMode: false,
        modelSelectionMode: "auto"
      })
    );
    expect(rememberResponse.status).toBe(200);

    const memoryResponse = await memoryList(jsonRequest("http://localhost/api/memory/list", "GET"));
    const memoryData = await memoryResponse.json();
    expect(memoryData.memories.length).toBeGreaterThan(0);

    const tutorResponse = await chatPost(
      jsonRequest("http://localhost/api/chat", "POST", {
        sessionId,
        message: "Teach me how to order tea politely.",
        saveToReview: true,
        verifyMode: true,
        modelSelectionMode: "complex"
      })
    );
    const sseBody = await tutorResponse.text();
    const finalEvent = parseSseFinal(sseBody);
    expect(finalEvent?.structured?.answer).toBeTruthy();
    expect(finalEvent?.budget).toMatchObject({ status: "allow", currentTokens: 0, maxTokens: 12_000 });

    const nextCardsResponse = await srsNext(new Request("http://localhost/api/srs/next?limit=5", {
      method: "GET",
      headers: { "x-user-id": userId }
    }));
    const nextCardsData = await nextCardsResponse.json();
    expect(nextCardsData.cards.length).toBeGreaterThan(0);
    const vocabItems = await listVocabItems(userId);
    expect(vocabItems).toEqual([
      expect.objectContaining({
        userId,
        hanzi: "茶",
        pinyin: "chá",
        english: "tea",
        sourceSessionId: sessionId
      })
    ]);

    const firstCardId = nextCardsData.cards[0].id as string;
    const gradeResponse = await srsGrade(
      jsonRequest("http://localhost/api/srs/grade", "POST", {
        cardId: firstCardId,
        grade: "good"
      })
    );
    expect(gradeResponse.status).toBe(200);

    const progressResponse = await progressSummary(jsonRequest("http://localhost/api/progress/summary", "GET"));
    const progressData = await progressResponse.json();
    expect(progressData.summary.totalSessions).toBe(1);
    expect(progressData.summary.vocabLearning).toBeGreaterThan(0);

    const memoryId = memoryData.memories[0].id as string;
    const deleteResponse = await memoryDelete(
      jsonRequest("http://localhost/api/memory/delete", "DELETE", { memoryId })
    );
    expect(deleteResponse.status).toBe(200);

    const endResponse = await sessionEnd(
      jsonRequest("http://localhost/api/session/end", "POST", {
        sessionId,
        durationSec: 180,
        summary: "Test complete"
      })
    );
    expect(endResponse.status).toBe(200);
  });

  it("limits chat before a provider call when session usage would exceed the budget", async () => {
    const session = await createSession(userId, "daily");
    await logAgentRun({
      userId,
      sessionId: session.id,
      nodeName: "TutorResponse",
      provider: "venice",
      tokens: 900,
      latencyMs: 25,
      costEstimate: 0.001
    });
    const usage = await getSessionAgentUsage(userId, session.id);
    expect(usage).toEqual({ tokens: 900, costEstimate: 0.001 });

    const previousMax = process.env.SESSION_BUDGET_MAX_TOKENS;
    process.env.SESSION_BUDGET_MAX_TOKENS = "1000";
    try {
      const fetchMock = vi.mocked(globalThis.fetch);
      const callsBefore = fetchMock.mock.calls.length;
      const response = await chatPost(jsonRequest("http://localhost/api/chat", "POST", {
        sessionId: session.id,
        message: "Teach me one useful phrase.",
        modelSelectionMode: "auto"
      }));

      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toMatchObject({
        code: "SESSION_BUDGET_LIMIT",
        budget: { status: "limit", currentTokens: 900, maxTokens: 1_000 }
      });
      expect(fetchMock.mock.calls).toHaveLength(callsBefore);
    } finally {
      if (previousMax === undefined) delete process.env.SESSION_BUDGET_MAX_TOKENS;
      else process.env.SESSION_BUDGET_MAX_TOKENS = previousMax;
    }
  });

  it("falls back to Venice TTS when ElevenLabs is not configured", async () => {
    const response = await voiceTts(
      jsonRequest("http://localhost/api/voice/tts", "POST", {
        text: "你好"
      })
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.provider).toBe("venice");
    expect(data.format).toBe("audio/mpeg;base64");
    expect(typeof data.audioBase64).toBe("string");
  });

  it("returns dynamic Venice model options", async () => {
    const response = await modelsGet(jsonRequest("http://localhost/api/models", "GET"));
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data.models)).toBe(true);
    expect(data.models).toContain("zai-org-glm-4.7");
    expect(data.models).toContain("zai-org-glm-5");
    expect(data.defaults.simple).toBe("zai-org-glm-4.7");
    expect(data.defaults.complex).toBe("zai-org-glm-5");
  });

  it("retries tutor generation when Venice returns reasoning without assistant content", async () => {
    let chatCompletionCalls = 0;

    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.url;

      if (url.includes("/chat/completions")) {
        chatCompletionCalls += 1;

        if (chatCompletionCalls === 1) {
          return new Response(
            JSON.stringify({
              choices: [{ finish_reason: "stop", message: { content: "", reasoning_content: "Thinking..." } }]
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          );
        }

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: "Here is the retry response.",
                    keyPoints: ["Retry handled"],
                    examples: ["谢谢。 (Thank you.)"],
                    microExercise: "Say thank you in Chinese.",
                    suggestedReviewItems: ["谢谢 (xiè xiè) - thank you"]
                  })
                }
              }
            ]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      throw new Error(`Unexpected external fetch in test: ${url}`);
    }) as typeof fetch;

    const structured = await generateTutorStructuredResponse({
      message: "Why does 谢谢 repeat the syllable?",
      memoryContext: [],
      profileSummary: "No saved profile yet.",
      recentUserMessages: [],
      modelSelectionMode: "complex"
    });

    expect(structured.answer).toBe("Here is the retry response.");
    expect(chatCompletionCalls).toBe(2);
  });

  it("requires bearer auth when dev fallback is disabled", async () => {
    process.env.ALLOW_DEV_AUTH_FALLBACK = "false";

    const response = await sessionStart(new Request("http://localhost/api/session/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "daily" })
    }));

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Missing bearer token.");
  });

  it("does not allow a user to chat against another user's session", async () => {
    const startResponse = await sessionStart(
      jsonRequest("http://localhost/api/session/start", "POST", { mode: "daily" }, userId)
    );
    const startData = await startResponse.json();

    const response = await chatPost(
      jsonRequest("http://localhost/api/chat", "POST", {
        sessionId: startData.sessionId,
        message: "remember topic: tea",
        verifyMode: false,
        modelSelectionMode: "auto"
      }, otherUserId)
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Session not found");
  });

  it("records tone practice evidence for the current user's session and exposes weak-pair progress context", async () => {
    const session = await createSession(userId, "quick");
    const prompt = TONE_PRACTICE_PROMPTS[1];
    const wrongChoice = prompt.choices.find((choice) => choice.id !== prompt.correctOption.id)!;
    const attempt = buildTonePracticeAttempt(prompt, wrongChoice.id, "2026-07-05T20:00:00.000Z");
    const cardsBefore = await addSrsCards(userId, ["茶 (chá) - tea"]);

    const response = await tonePracticeAttemptsPost(
      jsonRequest("http://localhost/api/tone-practice/attempts", "POST", {
        sessionId: session.id,
        attempts: [{ ...attempt, confidence: 2 }]
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.recordedCount).toBe(1);
    expect(data.weakTonePairs).toEqual([`tone pairs ${prompt.toneContrast} contrast`]);

    const summary = await computeProgressSummary(userId);
    expect(summary.weakAreas).toContain(`tone pairs ${prompt.toneContrast} contrast`);
    expect(await getAllCards(userId)).toEqual(cardsBefore);

    await endSession(session.id, 180, "Tone drill", userId);
    const endedSummary = await computeProgressSummary(userId);
    expect(endedSummary.totalMinutes).toBe(3);
  });

  it("rejects tone practice attempts for another user's session", async () => {
    const session = await createSession(userId, "quick");
    const prompt = TONE_PRACTICE_PROMPTS[0];

    const response = await tonePracticeAttemptsPost(
      jsonRequest("http://localhost/api/tone-practice/attempts", "POST", {
        sessionId: session.id,
        attempts: [buildTonePracticeAttempt(prompt, prompt.correctOption.id, "2026-07-05T20:00:00.000Z")]
      }, otherUserId)
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Session not found");
  });

  it("rejects malformed tone practice attempt payloads", async () => {
    const session = await createSession(userId, "quick");

    const response = await tonePracticeAttemptsPost(
      jsonRequest("http://localhost/api/tone-practice/attempts", "POST", {
        sessionId: session.id,
        attempts: [{
          promptId: "",
          toneContrast: "7/9",
          selectedAnswer: "ma1-mother",
          correctAnswer: "ma1-mother",
          result: "maybe",
          timestamp: "not-a-date"
        }]
      })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("attempts.0.promptId");
    expect(data.error).toContain("attempts.0.result");
  });

  it("keeps progress defaults empty when no tone practice evidence exists", async () => {
    await createSession(userId, "quick");

    const summary = await computeProgressSummary(userId);

    expect(summary.weakAreas).toEqual([]);
  });

  it("surfaces weak tone-pair context in continuity after completed tone practice", async () => {
    const session = await createSession(userId, "quick");
    const prompt = TONE_PRACTICE_PROMPTS[1];
    const wrongChoice = prompt.choices.find((choice) => choice.id !== prompt.correctOption.id)!;

    await tonePracticeAttemptsPost(
      jsonRequest("http://localhost/api/tone-practice/attempts", "POST", {
        sessionId: session.id,
        attempts: [buildTonePracticeAttempt(prompt, wrongChoice.id, "2026-07-05T20:00:00.000Z")]
      })
    );
    await endSession(session.id, 180, "Tone drill", userId);

    const response = await progressContinuity(jsonRequest("http://localhost/api/progress/continuity", "GET"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.continuity.summary).toBe("Tone drill");
    expect(data.continuity.toneFocus).toBe(`tone focus: ${prompt.toneContrast} contrast`);
  });

  it("omits tone focus from continuity when no weak tone attempts exist", async () => {
    const session = await createSession(userId, "quick");
    await endSession(session.id, 120, "Quick review", userId);

    const response = await progressContinuity(jsonRequest("http://localhost/api/progress/continuity", "GET"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.continuity.summary).toBe("Quick review");
    expect(data.continuity).not.toHaveProperty("toneFocus");
  });

  it("rejects malformed session IDs before reaching the store", async () => {
    const response = await chatPost(
      jsonRequest("http://localhost/api/chat", "POST", {
        sessionId: "not-a-session-id",
        message: "remember topic: tea",
        verifyMode: false,
        modelSelectionMode: "auto"
      })
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("sessionId: Invalid uuid");
    expect(data.error).not.toContain("22P02");
  });

  it("deduplicates SRS cards and skips malformed review items", async () => {
    const created = await addSrsCards(userId, [
      "茶 (chá) - tea",
      "茶 (chá) - tea",
      "我想点一杯茶",
      "plain English only"
    ]);
    const allCards = await getAllCards(userId);

    expect(created).toHaveLength(1);
    expect(allCards).toHaveLength(1);
    expect(allCards[0]).toMatchObject({
      prompt: "茶",
      answer: "chá — tea"
    });
    expect(allCards[0].prompt).not.toBe(allCards[0].answer);
  });

  it("upserts vocabulary items per user from valid review items", async () => {
    const session = await createSession(userId, "daily");

    const first = await addVocabItems(userId, [
      "茶 (chá) - tea",
      "茶 (chá) - tea",
      "plain English only",
      "我想点一杯茶"
    ], session.id);
    const second = await addVocabItems(userId, ["茶 (chá) - tea; tea leaf"], session.id);

    const ownItems = await listVocabItems(userId);
    const otherItems = await listVocabItems(otherUserId);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(ownItems).toHaveLength(1);
    expect(ownItems[0]).toMatchObject({
      userId,
      hanzi: "茶",
      pinyin: "chá",
      english: "tea; tea leaf",
      sourceSessionId: session.id,
      tags: ["auto-generated"]
    });
    expect(otherItems).toEqual([]);
  });

  it("reports all-time totals, weekly totals, and a consecutive streak separately", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-06-01T10:00:00.000Z"));
      const oldSession = await createSession(userId, "daily");
      await endSession(oldSession.id, 600, "Old session", userId);

      vi.setSystemTime(new Date("2026-06-08T10:00:00.000Z"));
      const yesterdaySession = await createSession(userId, "daily");
      await endSession(yesterdaySession.id, 300, "Yesterday session", userId);

      vi.setSystemTime(new Date("2026-06-09T10:00:00.000Z"));
      const todaySession = await createSession(userId, "daily");
      await endSession(todaySession.id, 120, "Today session", userId);

      const summary = await computeProgressSummary(userId);

      expect(summary.totalSessions).toBe(3);
      expect(summary.totalMinutes).toBe(17);
      expect(summary.weeklySessions).toBe(2);
      expect(summary.weeklyMinutes).toBe(7);
      expect(summary.streakDays).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires auth for provider-backed model and TTS endpoints when dev fallback is disabled", async () => {
    process.env.ALLOW_DEV_AUTH_FALLBACK = "false";

    const modelsResponse = await modelsGet(new Request("http://localhost/api/models", { method: "GET" }));
    expect(modelsResponse.status).toBe(401);

    const ttsResponse = await voiceTts(new Request("http://localhost/api/voice/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "你好", lang: "zh" })
    }));
    expect(ttsResponse.status).toBe(401);
  });
});
