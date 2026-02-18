import { getUserIdFromRequest } from "@/lib/auth";
import { badRequest, parseBody } from "@/lib/http";
import { chatSchema } from "@/lib/schemas";
import type { TutorStructuredResponse } from "@/lib/types";
import { runTutorGraph } from "@/server/agents/graph";
import {
  addMemory,
  addSrsCards,
  appendMessage,
  deleteMemory,
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

function normalizeReviewItem(value: string) {
  return value
    .replace(/\s+\([^)]*\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveReviewItems(structured: TutorStructuredResponse, userMessage: string, saveToReview?: boolean) {
  const candidates = [
    ...structured.suggestedReviewItems,
    ...structured.examples,
    ...structured.keyPoints.map((point) => `Concept: ${point}`),
    structured.microExercise
  ];

  if (saveToReview) {
    candidates.push(userMessage);
  }

  return Array.from(new Set(candidates.map(normalizeReviewItem).filter(Boolean))).slice(0, 20);
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

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, chatSchema);
    const userId = await getUserIdFromRequest(request);
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

    const started = Date.now();
    const graph = await runTutorGraph({
      userId,
      sessionId: body.sessionId,
      message: body.message,
      intent: body.intent,
      verifyMode: body.verifyMode,
      modelSelectionMode: body.modelSelectionMode,
      customModel: body.customModel
    });

    let answer = formatIntent(graph.structured.answer, body.intent);
    if (body.verifyMode) {
      answer += "\n\nVerification note: I may be wrong on edge-case grammar—cross-check if this is high-stakes.";
    }

    const reviewItems = deriveReviewItems(graph.structured, body.message, body.saveToReview);

    await appendMessage(body.sessionId, "assistant", answer);
    const cards = await addSrsCards(userId, reviewItems);

    await logAgentRun({
      userId,
      sessionId: body.sessionId,
      nodeName: "TutorResponse",
      latencyMs: Date.now() - started,
      costEstimate: 0.001
    });

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunkText(answer)) {
          controller.enqueue(sseEncoder.encode(`data: ${JSON.stringify({ type: "delta", content: chunk })}\n\n`));
        }
        controller.enqueue(
          sseEncoder.encode(
            `data: ${JSON.stringify({ type: "final", structured: { ...graph.structured, answer }, nodesExecuted: graph.nodesExecuted, createdReviewCards: cards.length })}\n\n`
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
    return badRequest((error as Error).message);
  }
}
