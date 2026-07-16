import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as chatPost } from "@/app/api/chat/route";
import { DELETE as memoryDelete } from "@/app/api/memory/delete/route";
import { GET as memoryList } from "@/app/api/memory/list/route";
import { GET as modelsGet } from "@/app/api/models/route";
import { POST as onboardingSave } from "@/app/api/onboarding/save/route";
import { GET as profileGet } from "@/app/api/profile/route";
import { GET as progressContinuity } from "@/app/api/progress/continuity/route";
import { GET as progressSummary } from "@/app/api/progress/summary/route";
import { GET as weeklyRecap } from "@/app/api/progress/weekly-recap/route";
import { POST as pushSend } from "@/app/api/push/send/route";
import {
  DELETE as pushUnsubscribe,
  POST as pushSubscribe
} from "@/app/api/push/subscribe/route";
import { POST as sessionEnd } from "@/app/api/session/end/route";
import { POST as sessionStart } from "@/app/api/session/start/route";
import { POST as srsGrade } from "@/app/api/srs/grade/route";
import { GET as srsNext } from "@/app/api/srs/next/route";
import { POST as tonePracticeAttempt } from "@/app/api/tone-practice/attempts/route";
import { POST as voiceTts } from "@/app/api/voice/tts/route";
import {
  REQUEST_ID_HEADER,
  resolveRequestId,
  withRequestContext
} from "@/lib/http";
import { createSession } from "@/server/store";
import { resetInMemoryStore } from "@/server/store/inMemory";

const userId = "00000000-0000-4000-8000-000000000001";
const originalFetch = globalThis.fetch;

function request(url: string, method: string, body?: unknown, headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  if (body !== undefined) requestHeaders.set("content-type", "application/json");

  return new Request(url, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

describe("API request correlation", () => {
  const originalDevAuthFallback = process.env.ALLOW_DEV_AUTH_FALLBACK;

  beforeEach(() => {
    resetInMemoryStore();
    process.env.ALLOW_DEV_AUTH_FALLBACK = originalDevAuthFallback;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.ALLOW_DEV_AUTH_FALLBACK = originalDevAuthFallback;
    vi.restoreAllMocks();
  });

  it("propagates only conservative caller IDs and replaces unsafe values", () => {
    expect(resolveRequestId("client_123:attempt-4.trace")).toBe("client_123:attempt-4.trace");

    for (const unsafe of [null, "", "contains spaces", "../path", "x".repeat(129), "🀄"]) {
      expect(resolveRequestId(unsafe)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    }
  });

  it("adds the resolved ID to JSON and SSE responses without changing their contracts", async () => {
    const jsonHandler = withRequestContext(async () => Response.json({ ok: true }, { status: 201 }));
    const jsonResponse = await jsonHandler(request("http://localhost/api/example", "POST", {}, {
      "x-request-id": "client-request-123"
    }));

    expect(jsonResponse.status).toBe(201);
    expect(jsonResponse.headers.get(REQUEST_ID_HEADER)).toBe("client-request-123");
    await expect(jsonResponse.json()).resolves.toEqual({ ok: true });

    const session = await createSession(userId, "daily");
    const sseResponse = await chatPost(request("http://localhost/api/chat", "POST", {
      sessionId: session.id,
      message: "remember topic: tea",
      modelSelectionMode: "auto"
    }, {
      "x-user-id": userId,
      "x-request-id": "chat-request-123"
    }));

    expect(sseResponse.status).toBe(200);
    expect(sseResponse.headers.get("content-type")).toContain("text/event-stream");
    expect(sseResponse.headers.get(REQUEST_ID_HEADER)).toBe("chat-request-123");
    expect(await sseResponse.text()).toContain('"type":"final"');
  });

  it("emits an allowlisted structured failure log without request or learner content", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = withRequestContext(async () => Response.json({
      error: "private learner message"
    }, { status: 400 }));

    const response = await handler(request("http://localhost/api/example?prompt=private", "POST", {
      prompt: "private learner message",
      providerPayload: "private provider response"
    }, {
      authorization: "Bearer private-token",
      cookie: "session=private-cookie",
      "x-request-id": "safe-request-123"
    }));

    expect(response.status).toBe(400);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("safe-request-123");
    expect(errorSpy).toHaveBeenCalledOnce();

    const logLine = errorSpy.mock.calls[0][0];
    expect(typeof logLine).toBe("string");
    expect(JSON.parse(logLine as string)).toEqual({
      event: "api_request_failed",
      requestId: "safe-request-123",
      route: "/api/example",
      method: "POST",
      status: 400,
      errorClass: "request_error",
      durationMs: expect.any(Number)
    });
    expect(logLine).not.toContain("private");
    expect(logLine).not.toContain("authorization");
    expect(logLine).not.toContain("cookie");
    expect(logLine).not.toContain("prompt");
    expect(logLine).not.toContain("providerPayload");
  });

  it("correlates an unexpected handler failure without leaking it into the operational log", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = withRequestContext(async () => {
      throw new Error("Unexpected provider failure");
    });

    const response = await handler(request("http://localhost/api/example", "GET", undefined, {
      "x-request-id": "unexpected-request-123"
    }));

    expect(response.status).toBe(400);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("unexpected-request-123");
    await expect(response.json()).resolves.toEqual({ error: "Unexpected provider failure" });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy.mock.calls[0][0]).not.toContain("provider");
  });

  it("correlates every supported API handler while preserving existing error statuses", async () => {
    process.env.ALLOW_DEV_AUTH_FALLBACK = "false";
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const cases = [
      ["chat", chatPost, request("http://localhost/api/chat", "POST", {})],
      ["memory delete", memoryDelete, request("http://localhost/api/memory/delete", "DELETE", {})],
      ["memory list", memoryList, request("http://localhost/api/memory/list", "GET")],
      ["models", modelsGet, request("http://localhost/api/models", "GET")],
      ["onboarding", onboardingSave, request("http://localhost/api/onboarding/save", "POST", {})],
      ["profile", profileGet, request("http://localhost/api/profile", "GET")],
      ["continuity", progressContinuity, request("http://localhost/api/progress/continuity", "GET")],
      ["progress summary", progressSummary, request("http://localhost/api/progress/summary", "GET")],
      ["weekly recap", weeklyRecap, request("http://localhost/api/progress/weekly-recap", "GET")],
      ["push send", pushSend, request("http://localhost/api/push/send", "POST", {})],
      ["push subscribe", pushSubscribe, request("http://localhost/api/push/subscribe", "POST", {})],
      ["push unsubscribe", pushUnsubscribe, request("http://localhost/api/push/subscribe", "DELETE", {})],
      ["session end", sessionEnd, request("http://localhost/api/session/end", "POST", {})],
      ["session start", sessionStart, request("http://localhost/api/session/start", "POST", {})],
      ["SRS grade", srsGrade, request("http://localhost/api/srs/grade", "POST", {})],
      ["SRS next", srsNext, request("http://localhost/api/srs/next", "GET")],
      ["tone practice", tonePracticeAttempt, request("http://localhost/api/tone-practice/attempts", "POST", {})],
      ["voice TTS", voiceTts, request("http://localhost/api/voice/tts", "POST", {})]
    ] as const;

    for (const [name, handler, apiRequest] of cases) {
      const response = await handler(apiRequest);
      expect(response.status, name).toBeGreaterThanOrEqual(400);
      expect(response.headers.get(REQUEST_ID_HEADER), name).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});
