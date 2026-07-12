import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as chatPost } from "@/app/api/chat/route";
import { DELETE as memoryDelete } from "@/app/api/memory/delete/route";
import { GET as memoryList } from "@/app/api/memory/list/route";
import { GET as modelsGet } from "@/app/api/models/route";
import { POST as onboardingSave } from "@/app/api/onboarding/save/route";
import { GET as profileGet } from "@/app/api/profile/route";
import { GET as progressContinuity } from "@/app/api/progress/continuity/route";
import { GET as progressSummary } from "@/app/api/progress/summary/route";
import { GET as weeklyRecap } from "@/app/api/progress/weekly-recap/route";
import {
  DELETE as pushUnsubscribe,
  POST as pushSubscribe
} from "@/app/api/push/subscribe/route";
import { POST as sessionEnd } from "@/app/api/session/end/route";
import { POST as sessionStart } from "@/app/api/session/start/route";
import { POST as srsGrade } from "@/app/api/srs/grade/route";
import { GET as srsNext } from "@/app/api/srs/next/route";
import { POST as tonePracticeAttemptsPost } from "@/app/api/tone-practice/attempts/route";
import { POST as voiceTts } from "@/app/api/voice/tts/route";
import { addMemory, addSrsCards, addVocabItems, createSession, endSession, listVocabItems } from "@/server/store";
import { resetInMemoryStore } from "@/server/store/inMemory";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const missingUuid = "33333333-3333-4333-8333-333333333333";

type RouteHandler = (request: Request) => Response | Promise<Response>;

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

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function migrationSql() {
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(migrationsDir, file), "utf8"))
    .join("\n")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

describe("auth and RLS regression coverage", () => {
  const originalDevAuthFallback = process.env.ALLOW_DEV_AUTH_FALLBACK;

  beforeEach(() => {
    resetInMemoryStore();
    process.env.ALLOW_DEV_AUTH_FALLBACK = originalDevAuthFallback;
  });

  afterEach(() => {
    process.env.ALLOW_DEV_AUTH_FALLBACK = originalDevAuthFallback;
  });

  it("requires authenticated requests on critical user-owned routes when dev fallback is disabled", async () => {
    process.env.ALLOW_DEV_AUTH_FALLBACK = "false";

    const cases: Array<{ name: string; handler: RouteHandler; request: Request }> = [
      {
        name: "onboarding save",
        handler: onboardingSave,
        request: jsonRequest("http://localhost/api/onboarding/save", "POST", {
          goals: ["travel"],
          interests: ["tea"],
          level: "beginner",
          timezone: "UTC",
          coachStyle: "friendly",
          minutesPerDay: 10
        })
      },
      {
        name: "profile read",
        handler: profileGet,
        request: new Request("http://localhost/api/profile", { method: "GET" })
      },
      {
        name: "session start",
        handler: sessionStart,
        request: jsonRequest("http://localhost/api/session/start", "POST", { mode: "daily" })
      },
      {
        name: "session end",
        handler: sessionEnd,
        request: jsonRequest("http://localhost/api/session/end", "POST", {
          sessionId: missingUuid,
          durationSec: 60
        })
      },
      {
        name: "chat",
        handler: chatPost,
        request: jsonRequest("http://localhost/api/chat", "POST", {
          sessionId: missingUuid,
          message: "remember topic: tea",
          modelSelectionMode: "auto"
        })
      },
      {
        name: "memory list",
        handler: memoryList,
        request: new Request("http://localhost/api/memory/list", { method: "GET" })
      },
      {
        name: "memory delete",
        handler: memoryDelete,
        request: jsonRequest("http://localhost/api/memory/delete", "DELETE", { memoryId: missingUuid })
      },
      {
        name: "progress summary",
        handler: progressSummary,
        request: new Request("http://localhost/api/progress/summary", { method: "GET" })
      },
      {
        name: "progress continuity",
        handler: progressContinuity,
        request: new Request("http://localhost/api/progress/continuity", { method: "GET" })
      },
      {
        name: "weekly recap",
        handler: weeklyRecap,
        request: new Request("http://localhost/api/progress/weekly-recap", { method: "GET" })
      },
      {
        name: "SRS next",
        handler: srsNext,
        request: new Request("http://localhost/api/srs/next?limit=5", { method: "GET" })
      },
      {
        name: "SRS grade",
        handler: srsGrade,
        request: jsonRequest("http://localhost/api/srs/grade", "POST", {
          cardId: missingUuid,
          grade: "good"
        })
      },
      {
        name: "tone practice attempts",
        handler: tonePracticeAttemptsPost,
        request: jsonRequest("http://localhost/api/tone-practice/attempts", "POST", {
          sessionId: missingUuid,
          attempts: [{
            promptId: "tone-1",
            toneContrast: "2/4",
            selectedAnswer: "ma2",
            correctAnswer: "ma4",
            result: "incorrect",
            timestamp: "2026-07-05T20:00:00.000Z"
          }]
        })
      },
      {
        name: "models",
        handler: modelsGet,
        request: new Request("http://localhost/api/models", { method: "GET" })
      },
      {
        name: "voice TTS",
        handler: voiceTts,
        request: jsonRequest("http://localhost/api/voice/tts", "POST", { text: "你好" })
      },
      {
        name: "push subscribe",
        handler: pushSubscribe,
        request: jsonRequest("http://localhost/api/push/subscribe", "POST", {
          endpoint: "https://push.example.test/sub/1",
          keys: { p256dh: "p256dh", auth: "auth" }
        })
      },
      {
        name: "push unsubscribe",
        handler: pushUnsubscribe,
        request: jsonRequest("http://localhost/api/push/subscribe", "DELETE", {
          endpoint: "https://push.example.test/sub/1"
        })
      }
    ];

    for (const current of cases) {
      const response = await current.handler(current.request);
      expect(response.status, current.name).toBe(401);
      await expect(readJson(response)).resolves.toMatchObject({ error: "Missing bearer token." });
    }
  });

  it("rejects bearer tokens when Supabase auth is not configured", async () => {
    const request = jsonRequest("http://localhost/api/session/start", "POST", { mode: "daily" });
    request.headers.set("authorization", "Bearer invalid-token");

    const response = await sessionStart(request);

    expect(response.status).toBe(401);
    await expect(readJson(response)).resolves.toMatchObject({
      error: "Auth provider is not configured."
    });
  });

  it("isolates profiles, sessions, messages, memories, SRS cards, and progress by user", async () => {
    const onboardingResponse = await onboardingSave(
      jsonRequest("http://localhost/api/onboarding/save", "POST", {
        goals: ["travel"],
        interests: ["tea"],
        level: "beginner",
        timezone: "UTC",
        coachStyle: "friendly",
        minutesPerDay: 10
      }, userId)
    );
    expect(onboardingResponse.status).toBe(200);

    const ownProfileResponse = await profileGet(jsonRequest("http://localhost/api/profile", "GET", undefined, userId));
    await expect(readJson(ownProfileResponse)).resolves.toMatchObject({
      profile: { userId, goals: ["travel"] }
    });

    const otherProfileResponse = await profileGet(jsonRequest("http://localhost/api/profile", "GET", undefined, otherUserId));
    await expect(readJson(otherProfileResponse)).resolves.toMatchObject({ profile: null });

    const session = await createSession(userId, "daily");
    await addMemory(userId, "topic", "tea", "preference");
    const [card] = await addSrsCards(userId, ["茶 (chá) - tea"]);
    await addVocabItems(userId, ["茶 (chá) - tea"], session.id);
    await endSession(session.id, 180, "Practiced ordering tea", userId);

    const crossUserChatResponse = await chatPost(
      jsonRequest("http://localhost/api/chat", "POST", {
        sessionId: session.id,
        message: "remember topic: coffee",
        modelSelectionMode: "auto"
      }, otherUserId)
    );
    expect(crossUserChatResponse.status).toBe(404);
    await expect(readJson(crossUserChatResponse)).resolves.toMatchObject({ error: "Session not found" });

    const crossUserSessionEndResponse = await sessionEnd(
      jsonRequest("http://localhost/api/session/end", "POST", {
        sessionId: session.id,
        durationSec: 240
      }, otherUserId)
    );
    expect(crossUserSessionEndResponse.status).toBe(400);
    await expect(readJson(crossUserSessionEndResponse)).resolves.toMatchObject({ error: "Session not found" });

    const ownMemoryResponse = await memoryList(jsonRequest("http://localhost/api/memory/list", "GET", undefined, userId));
    const ownMemoryData = await readJson(ownMemoryResponse);
    expect(ownMemoryData.memories).toMatchObject([{ userId, key: "topic", value: "tea" }]);

    const otherMemoryResponse = await memoryList(jsonRequest("http://localhost/api/memory/list", "GET", undefined, otherUserId));
    await expect(readJson(otherMemoryResponse)).resolves.toMatchObject({ memories: [] });

    const crossUserDeleteResponse = await memoryDelete(
      jsonRequest("http://localhost/api/memory/delete", "DELETE", {
        memoryId: (ownMemoryData.memories as Array<{ id: string }>)[0].id
      }, otherUserId)
    );
    expect(crossUserDeleteResponse.status).toBe(400);
    await expect(readJson(crossUserDeleteResponse)).resolves.toMatchObject({ error: "Memory not found" });

    const otherCardsResponse = await srsNext(
      jsonRequest("http://localhost/api/srs/next?limit=5", "GET", undefined, otherUserId)
    );
    await expect(readJson(otherCardsResponse)).resolves.toMatchObject({ cards: [] });
    expect(await listVocabItems(userId)).toHaveLength(1);
    expect(await listVocabItems(otherUserId)).toEqual([]);

    const crossUserGradeResponse = await srsGrade(
      jsonRequest("http://localhost/api/srs/grade", "POST", {
        cardId: card.id,
        grade: "good"
      }, otherUserId)
    );
    expect(crossUserGradeResponse.status).toBe(400);
    await expect(readJson(crossUserGradeResponse)).resolves.toMatchObject({ error: "Card not found" });

    const ownProgressResponse = await progressSummary(
      jsonRequest("http://localhost/api/progress/summary", "GET", undefined, userId)
    );
    await expect(readJson(ownProgressResponse)).resolves.toMatchObject({
      summary: { totalSessions: 1, totalMinutes: 3, vocabLearning: 1 }
    });

    const otherProgressResponse = await progressSummary(
      jsonRequest("http://localhost/api/progress/summary", "GET", undefined, otherUserId)
    );
    await expect(readJson(otherProgressResponse)).resolves.toMatchObject({
      summary: { totalSessions: 0, totalMinutes: 0, vocabLearning: 0, dueCards: 0 }
    });
  });

  it("keeps critical user-owned tables protected by RLS owner policies in migrations", () => {
    const sql = migrationSql();
    const ownerTables = ["profiles", "sessions", "memories", "vocab_items", "srs_cards", "agent_runs", "learning_events"];

    for (const table of ownerTables) {
      expect(sql).toContain(`alter table learn_chinese.${table} enable row level security`);
      const policyPrefix = table === "agent_runs"
        ? "runs"
        : table === "vocab_items"
          ? "vocab"
          : table.replace("_cards", "");
      expect(sql).toContain(`policy ${policyPrefix}_owner`);
      expect(sql).toContain(`on learn_chinese.${table}`);
    }

    expect(sql).toMatch(
      /using \(\(select auth\.uid\(\)\) = user_id\) with check \(\(select auth\.uid\(\)\) = user_id\)/
    );
    expect(sql).toContain("alter table learn_chinese.messages enable row level security");
    expect(sql).toContain("policy messages_owner on learn_chinese.messages");
    expect(sql).toContain("where s.id = messages.session_id and s.user_id = (select auth.uid())");
    expect(sql).toContain("alter table learn_chinese.memory_events enable row level security");
    expect(sql).toContain("policy memory_events_owner on learn_chinese.memory_events");
    expect(sql).toContain("where m.id = memory_events.memory_id and m.user_id = (select auth.uid())");
    expect(sql).toContain("alter table learn_chinese.push_subscriptions enable row level security");
    expect(sql).toContain("policy push_subs_owner on learn_chinese.push_subscriptions");
    expect(sql).toContain("grant select, insert, update, delete on learn_chinese.push_subscriptions to authenticated");
  });
});
