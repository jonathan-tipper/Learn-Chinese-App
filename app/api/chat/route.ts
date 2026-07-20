import { getUserIdFromRequest } from "@/lib/auth";
import { isVeniceEnabled } from "@/lib/env";
import { errorResponse, notFound, parseBody, withRequestContext } from "@/lib/http";
import { chatSchema } from "@/lib/schemas";
import type { TutorStructuredResponse } from "@/lib/types";
import {
  estimateCostUsd,
  estimateTokens,
  evaluateSessionBudget,
  parseSessionBudgetConfig
} from "@/lib/session-budget";
import { runTutorGraph } from "@/server/agents/graph";
import {
  addMemory,
  addGrammarPoints,
  addSrsCards,
  addVocabItems,
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

function formatIntent(answer: string, intent?: string) {
  if (intent === "more_examples") {
    return `${answer}\n\nMore examples:\n- 我今天想练习中文。\n- 我可以先点一杯茶吗？\n- 我在学习更自然的表达。`;
  }

  if (intent === "quiz_me") {
    return `${answer}\n\nQuick quiz: Translate “I’d like to order tea today.”`;
  }

  return answer;
}

function deriveReviewItems(structured: TutorStructuredResponse, userMessage: string, saveToReview?: boolean) {
  // Only use suggestedReviewItems — the LLM formats these as "hanzi (pinyin) - English".
  // examples/keyPoints/microExercise are teaching aids, not SRS vocab flashcards.
  const candidates = [...structured.suggestedReviewItems];

  if (saveToReview) {
    candidates.push(userMessage);
  }

  return Array.from(new Set(candidates.map((v) => v.trim()).filter(Boolean))).slice(0, 20);
}

function chunkText(content: string, chunkSize = 90) {
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.slice(i, i + chunkSize));
  }
  return chunks;
}

function streamFinal(answer: string) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          sseEncoder.encode(
            `data: ${JSON.stringify({ type: "final", structured: { answer, keyPoints: [], examples: [], microExercise: "", suggestedReviewItems: [] } })}\n\n`
          )
        );
        controller.close();
      }
    }),
    { headers: { "Content-Type": "text/event-stream" } }
  );
}

async function chatHandler(request: Request) {
  try {
    const body = await parseBody(request, chatSchema);
    const userId = await getUserIdFromRequest(request);
    const session = await getSessionForUser(userId, body.sessionId);
    if (!session) {
      return notFound("Session not found");
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

    const started = Date.now();
    const graph = await runTutorGraph({
      userId,
      sessionId: body.sessionId,
      message: body.message,
      intent: body.intent,
      verifyMode: body.verifyMode,
      modelSelectionMode: body.modelSelectionMode,
      customModel: body.customModel,
      planSnippet: body.planSnippet
    });

    let answer = formatIntent(graph.structured.answer, body.intent);
    if (body.verifyMode) {
      answer += "\n\nVerification note: I may be wrong on edge-case grammar—cross-check if this is high-stakes.";
    }

    const reviewItems = deriveReviewItems(graph.structured, body.message, body.saveToReview);
    const actualTokens = estimateTokens(`${body.message}\n${answer}`, 0);
    const finalBudget = evaluateSessionBudget(budgetConfig, usage.tokens, actualTokens);

    await appendMessage(body.sessionId, "assistant", answer);
    const cards = await addSrsCards(userId, reviewItems);
    await addVocabItems(userId, reviewItems, body.sessionId);
    try {
      await addGrammarPoints(userId, graph.structured.grammarPoints ?? []);
    } catch (error) {
      console.error("Failed to persist grammar points", error);
    }

    await logAgentRun({
      userId,
      sessionId: body.sessionId,
      nodeName: "TutorResponse",
      provider: isVeniceEnabled() ? "venice" : "local-fallback",
      tokens: actualTokens,
      latencyMs: Date.now() - started,
      costEstimate: estimateCostUsd(actualTokens, budgetConfig)
    });

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunkText(answer)) {
          controller.enqueue(sseEncoder.encode(`data: ${JSON.stringify({ type: "delta", content: chunk })}\n\n`));
        }
        controller.enqueue(
          sseEncoder.encode(
            `data: ${JSON.stringify({ type: "final", structured: { ...graph.structured, answer }, nodesExecuted: graph.nodesExecuted, createdReviewCards: cards.length, budget: finalBudget })}\n\n`
          )
        );
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRequestContext(chatHandler);
