import { env, isVeniceEnabled } from "@/lib/env";
import type { MessageRecord, Profile } from "@/lib/types";
import { type TokenUsage, chatComplete, estimateModelCostUsd } from "@/server/llm/venice";

export interface SummarizeSessionInput {
  messages: MessageRecord[];
  profile?: Profile | null;
  model?: string;
}

export interface SummarizeSessionResult {
  summary: string;
  generated: boolean;
  usage?: TokenUsage;
  model?: string;
  costUsd?: number;
}

const MAX_SUMMARY_CHARS = 280;

function clean(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

/** Deterministic summary used when the model is unavailable or the session was tiny. */
export function fallbackSessionSummary(messages: MessageRecord[]) {
  const userMessages = messages.filter((message) => message.role === "user").map((message) => clean(message.content));
  if (userMessages.length === 0) return "Opened a session without asking anything.";
  const first = userMessages[0].length > 90 ? `${userMessages[0].slice(0, 90)}…` : userMessages[0];
  if (userMessages.length === 1) return `Asked about: ${first}`;
  return `Asked about: ${first} (+${userMessages.length - 1} more question${userMessages.length - 1 === 1 ? "" : "s"})`;
}

export async function summarizeSession(input: SummarizeSessionInput): Promise<SummarizeSessionResult> {
  const conversational = input.messages.filter((message) => message.role !== "system");
  const fallback = fallbackSessionSummary(conversational);

  if (!isVeniceEnabled() || conversational.length < 2) {
    return { summary: fallback, generated: false };
  }

  const transcript = conversational
    .slice(-16)
    .map((message) => `${message.role === "user" ? "LEARNER" : "COACH"}: ${clean(message.content).slice(0, 600)}`)
    .join("\n");

  try {
    const result = await chatComplete({
      model: input.model ?? env.veniceSimpleModel,
      temperature: 0.2,
      maxTokens: 140,
      timeoutMs: 20_000,
      messages: [
        {
          role: "system",
          content: "You write one- or two-sentence past-tense summaries of Mandarin practice sessions for the learner's own progress log. Name the key Chinese words or phrases with pinyin. Maximum 45 words. Plain text only, no JSON, no quotes."
        },
        {
          role: "user",
          content: `Learner level: ${input.profile?.level ?? "unknown"}.\n\nTranscript:\n${transcript}\n\nSummary:`
        }
      ]
    });

    const summary = clean(result.content).replace(/^summary:\s*/i, "").slice(0, MAX_SUMMARY_CHARS);
    if (!summary) return { summary: fallback, generated: false };

    return {
      summary,
      generated: true,
      usage: result.usage,
      model: result.model,
      costUsd: estimateModelCostUsd(result.model, result.usage)
    };
  } catch (error) {
    console.warn("Session summary fallback:", error instanceof Error ? error.message : error);
    return { summary: fallback, generated: false };
  }
}
