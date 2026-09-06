import { randomUUID } from "crypto";
import { getUserIdFromRequest } from "@/lib/auth";
import { isVeniceEnabled } from "@/lib/env";
import { errorResponse, notFound, parseBody, withRequestContext } from "@/lib/http";
import { chatSchema } from "@/lib/schemas";
import type { TutorStructuredResponse } from "@/lib/types";
import {
  estimateTokens,
  evaluateSessionBudget,
  parseSessionBudgetConfig
} from "@/lib/session-budget";
import { runTutorGraph } from "@/server/agents/graph";
import { registerStreamSink, releaseStreamSink } from "@/server/agents/streamSink";
import {
  addMemory,
  appendMessage,
  deleteMemory,
  getSessionForUser,
  getSessionAgentUsage,
  listMemories,
  logAgentRun
} from "@/server/store";

export const runtime = "nodejs";
const sseEncoder = new TextEncoder();

function parseMemoryCommand(message: string) {
  const rememberMatch = message.match(/^remember\s+(.+?)\s*:\s*(.+)$/i);
  if (rememberMatch) {
    return { action: "remember" as const, key: rememberMatch[1].trim(), value: rememberMatch[2].trim() };
  }

  const forgetMatch = message.match(/^forget\s+(.+)$/i);
  if (forgetMatch) {
    return { action: "forget" as const, target: forgetMatch[1].trim().toLowerCase() };
  }

  return null;
}

function sseEvent(payload: Record<string, unknown>) {
  return sseEncoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function emptyStructured(answer: string): TutorStructuredResponse {
  return { answer, keyPoints: [], examples: [], microExercise: "", suggestedReviewItems: [] };
}

function streamFinal(answer: string) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(sseEvent({ type: "delta", content: answer }));
        controller.enqueue(sseEvent({ type: "final", structured: emptyStructured(answer) }));
        controller.close();
      }
    }),
    { headers: { "Content-Type": "text/event-stream" } }
  );
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no"
};

async function chatHandler(request: Request) {
  try {
    const body = await parseBody(request, chatSchema);
    const userId = await getUserIdFromRequest(request);
    const session = await getSessionForUser(userId, body.sessionId);
    if (!session) {
      return notFound("Session not found");
    }
    if (session.endedAt) {
      return Response.json({ error: "This session has ended. Start a new session to continue.", code: "SESSION_ENDED" }, { status: 409 });
    }

    await appendMessage(body.sessionId, "user", body.message);

    const memoryCommand = parseMemoryCommand(body.message);
    if (memoryCommand?.action === "remember") {
      const saved = await addMemory(userId, memoryCommand.key, memoryCommand.value, "preference");
      const answer = `Got it — I’ll remember: ${saved.key} = ${saved.value}.`;
      await appendMessage(body.sessionId, "assistant", answer);
      return streamFinal(answer);
    }

    if (memoryCommand?.action === "forget") {
      const memories = await listMemories(userId);
      const candidate = memories.find((m) => m.key.toLowerCase() === memoryCommand.target);
      const removed = candidate ? await deleteMemory(userId, candidate.id) : false;
      const answer = removed
        ? `Done — I forgot '${memoryCommand.target}'.`
        : `I couldn’t find a memory named '${memoryCommand.target}'.`;
      await appendMessage(body.sessionId, "assistant", answer);
      return streamFinal(answer);
    }

    const budgetConfig = parseSessionBudgetConfig();
    const usage = await getSessionAgentUsage(userId, body.sessionId);
    const estimatedNextTokens = estimateTokens(body.message);
    const initialBudget = evaluateSessionBudget(budgetConfig, usage.tokens, estimatedNextTokens);
    if (initialBudget.status === "limit") {
      return Response.json({
        error: "This session has reached its estimated usage limit. Start a new session to continue.",
        code: "SESSION_BUDGET_LIMIT",
        budget: initialBudget
      }, { status: 429 });
    }

    const runId = randomUUID();
    const started = Date.now();

    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        const safeEnqueue = (payload: Record<string, unknown>) => {
          if (closed) return;
          try {
            controller.enqueue(sseEvent(payload));
          } catch {
            closed = true;
          }
        };

        registerStreamSink(runId, {
          onDelta: (content) => safeEnqueue({ type: "delta", content }),
          onStructured: (structured) => safeEnqueue({ type: "structured", structured })
        });

        void (async () => {
          try {
            const graph = await runTutorGraph({
              userId,
              sessionId: body.sessionId,
              runId,
              message: body.message,
              intent: body.intent,
              verifyMode: body.verifyMode,
              modelSelectionMode: body.modelSelectionMode,
              customModel: body.customModel,
              planSnippet: body.planSnippet,
              saveToReview: body.saveToReview
            });

            const answer = graph.structured.answer;
            await appendMessage(body.sessionId, "assistant", answer);

            const tokensUsed = graph.agentRuns.reduce((total, run) => total + run.tokens, 0)
              || estimateTokens(`${body.message}\n${answer}`, 0);
            const finalBudget = evaluateSessionBudget(budgetConfig, usage.tokens, tokensUsed);

            for (const run of graph.agentRuns) {
              await logAgentRun({
                userId,
                sessionId: body.sessionId,
                nodeName: run.nodeName,
                provider: run.model ? `venice:${run.model}` : isVeniceEnabled() ? "venice" : "local-fallback",
                tokens: run.tokens,
                latencyMs: run.latencyMs,
                costEstimate: run.costUsd
              });
            }

            safeEnqueue({
              type: "final",
              structured: graph.structured,
              nodesExecuted: graph.nodesExecuted,
              createdReviewCards: graph.createdReviewCards,
              memoriesSaved: graph.memoriesSaved.map((memory) => ({ key: memory.key, value: memory.value, type: memory.type })),
              model: graph.model,
              latencyMs: Date.now() - started,
              budget: finalBudget
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "The coach could not answer right now.";
            console.error("Chat generation failed", error);
            safeEnqueue({ type: "error", error: message });
          } finally {
            releaseStreamSink(runId);
            if (!closed) {
              closed = true;
              try {
                controller.close();
              } catch {
                // already closed by the client
              }
            }
          }
        })();
      },
      cancel() {
        releaseStreamSink(runId);
      }
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRequestContext(chatHandler);
