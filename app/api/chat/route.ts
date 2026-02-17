import { getUserIdFromHeaders } from "@/lib/auth";
import { badRequest, parseBody } from "@/lib/http";
import { chatSchema } from "@/lib/schemas";
import { runTutorGraph } from "@/server/agents/graph";
import {
  addMemory,
  addSrsCards,
  appendMessage,
  deleteMemory,
  listMemories,
  logAgentRun
} from "@/server/store/inMemory";

export const runtime = "nodejs";

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

function streamFinal(answer: string) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          `data: ${JSON.stringify({ type: "final", structured: { answer, keyPoints: [], examples: [], microExercise: "", suggestedReviewItems: [] } })}\n\n`
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
    const userId = getUserIdFromHeaders();
    appendMessage(body.sessionId, "user", body.message);

    const memoryCommand = parseMemoryCommand(body.message);
    if (memoryCommand?.action === "remember") {
      const saved = addMemory(userId, memoryCommand.key, memoryCommand.value, "preference");
      const answer = `Got it — I’ll remember: ${saved.key} = ${saved.value}.`;
      appendMessage(body.sessionId, "assistant", answer);
      return streamFinal(answer);
    }

    if (memoryCommand?.action === "forget") {
      const candidate = listMemories(userId).find((m) => m.key.toLowerCase() === memoryCommand.target);
      const removed = candidate ? deleteMemory(userId, candidate.id) : false;
      const answer = removed
        ? `Done — I forgot '${memoryCommand.target}'.`
        : `I couldn’t find a memory named '${memoryCommand.target}'.`;
      appendMessage(body.sessionId, "assistant", answer);
      return streamFinal(answer);
    }

    const started = Date.now();
    const graph = await runTutorGraph({ userId, sessionId: body.sessionId, message: body.message });

    let answer = formatIntent(graph.structured.answer, body.intent);
    if (body.verifyMode) {
      answer += "\n\nVerification note: I may be wrong on edge-case grammar—cross-check if this is high-stakes.";
    }

    const reviewItems = body.saveToReview
      ? [...graph.structured.suggestedReviewItems, body.message]
      : graph.structured.suggestedReviewItems;

    appendMessage(body.sessionId, "assistant", answer);
    const cards = addSrsCards(userId, reviewItems);

    logAgentRun({
      userId,
      sessionId: body.sessionId,
      nodeName: "TutorResponse",
      latencyMs: Date.now() - started,
      costEstimate: 0.001
    });

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(`data: ${JSON.stringify({ type: "delta", content: answer })}\n\n`);
        controller.enqueue(
          `data: ${JSON.stringify({ type: "final", structured: { ...graph.structured, answer }, nodesExecuted: graph.nodesExecuted, createdReviewCards: cards.length })}\n\n`
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
