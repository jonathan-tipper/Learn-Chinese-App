import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as chatPost } from "@/app/api/chat/route";
import { DELETE as memoryDelete } from "@/app/api/memory/delete/route";
import { GET as memoryList } from "@/app/api/memory/list/route";
import { GET as modelsGet } from "@/app/api/models/route";
import { POST as onboardingSave } from "@/app/api/onboarding/save/route";
import { GET as progressSummary } from "@/app/api/progress/summary/route";
import { POST as sessionEnd } from "@/app/api/session/end/route";
import { POST as sessionStart } from "@/app/api/session/start/route";
import { POST as srsGrade } from "@/app/api/srs/grade/route";
import { GET as srsNext } from "@/app/api/srs/next/route";
import { POST as voiceTts } from "@/app/api/voice/tts/route";
import { env } from "@/lib/env";
import { resetInMemoryStore } from "@/server/store/inMemory";

const userId = "11111111-1111-4111-8111-111111111111";
const originalFetch = globalThis.fetch;

function jsonRequest(url: string, method: string, body?: unknown) {
  const headers = new Headers({ "x-user-id": userId });
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
          suggestedReviewItems: ["我想点一杯茶"]
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

    const nextCardsResponse = await srsNext(new Request("http://localhost/api/srs/next?limit=5", {
      method: "GET",
      headers: { "x-user-id": userId }
    }));
    const nextCardsData = await nextCardsResponse.json();
    expect(nextCardsData.cards.length).toBeGreaterThan(0);

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
    const response = await modelsGet();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data.models)).toBe(true);
    expect(data.models).toContain("zai-org-glm-4.7");
    expect(data.models).toContain("zai-org-glm-5");
    expect(data.defaults.simple).toBe("zai-org-glm-4.7");
    expect(data.defaults.complex).toBe("zai-org-glm-5");
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
});
