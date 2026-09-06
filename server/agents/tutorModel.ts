import { z } from "zod";
import { env } from "@/lib/env";
import { normalizeGrammarPointSignals } from "@/lib/grammar-points";
import { createJsonStringFieldStreamer } from "@/lib/streaming-json";
import type { Profile, TutorStructuredResponse } from "@/lib/types";
import {
  type ModelSelectionMode,
  type VeniceModelPreferences,
  resolveVeniceModel
} from "@/lib/venice";
import {
  type ChatMessage,
  type TokenUsage,
  chatComplete,
  estimateModelCostUsd,
  parseJsonObject,
  streamChatComplete
} from "@/server/llm/venice";

const structuredSchema = z.object({
  answer: z.string().min(1),
  keyPoints: z.array(z.string()).min(1).max(4),
  examples: z.array(z.string()).min(1).max(6),
  microExercise: z.string().min(1),
  suggestedReviewItems: z.array(z.string()).min(1).max(10),
  grammarPoints: z.array(z.object({
    title: z.string().min(1),
    explanation: z.string().min(1),
    examples: z.array(z.string()).max(4),
    confidence: z.literal("high")
  })).max(4).default([]),
  topic: z.string().max(60).optional()
});

export interface TutorHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TutorGenerationInput {
  message: string;
  intent?: string;
  history?: TutorHistoryMessage[];
  memoryContext: string[];
  profile?: Profile | null;
  /** Legacy free-text profile summary; ignored when `profile` is provided. */
  profileSummary?: string;
  /** Legacy input kept for compatibility; superseded by `history`. */
  recentUserMessages?: string[];
  planFocus?: string;
  weakAreas?: string[];
  dueCards?: number;
  verifyMode?: boolean;
  modelSelectionMode?: ModelSelectionMode;
  customModel?: string;
  modelPreferences?: VeniceModelPreferences;
  /** Receives answer text as it streams. */
  onDelta?: (text: string) => void;
}

export interface TutorGenerationResult {
  structured: TutorStructuredResponse;
  model: string;
  usage: TokenUsage;
  latencyMs: number;
  costUsd: number;
}

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 700;

function firstNonEmptyString(candidates: unknown[], fallback: string) {
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const cleaned = candidate.trim();
      if (cleaned) return cleaned;
    }
  }
  return fallback;
}

function boundedStringArray(value: unknown, maxItems: number, fallback: string[]) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const cleaned = source
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);

  if (cleaned.length > 0) {
    return cleaned;
  }

  return fallback
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeTopic(value: unknown) {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, " ").slice(0, 60);
  return cleaned || undefined;
}

export function normalizeStructuredPayload(raw: unknown): TutorStructuredResponse {
  const payload = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const answer = firstNonEmptyString(
    [payload.answer, payload.response, payload.text],
    "Let me give a concise Mandarin explanation."
  );
  const keyPoints = boundedStringArray(payload.keyPoints, 4, ["Use this pattern in one short sentence."]);
  const examples = boundedStringArray(payload.examples, 6, [answer]);
  const microExercise = firstNonEmptyString(
    [payload.microExercise, payload.exercise],
    "Write one sentence using the pattern above."
  );
  const suggestedReviewItems = boundedStringArray(payload.suggestedReviewItems, 10, keyPoints);
  const grammarPoints = normalizeGrammarPointSignals(payload.grammarPoints);
  const topic = normalizeTopic(payload.topic);

  return structuredSchema.parse({
    answer,
    keyPoints,
    examples,
    microExercise,
    suggestedReviewItems,
    grammarPoints,
    topic
  });
}

const STYLE_GUIDANCE: Record<Profile["coachStyle"], string> = {
  strict: "Tone: direct and exacting. Correct every error explicitly and explain why. Skip filler praise.",
  friendly: "Tone: warm and encouraging. Acknowledge progress in a few words, then correct gently but clearly.",
  playful: "Tone: light and fun. Use vivid mini-scenarios and a touch of humour while staying precise.",
  concise: "Tone: minimal. Short sentences, no preamble, no repetition."
};

const LEVEL_GUIDANCE: Record<Profile["level"], string> = {
  beginner: "Level: beginner. Every Chinese word or phrase must carry pinyin with tone marks and an English gloss. Keep example sentences to 3-8 characters using high-frequency words.",
  intermediate: "Level: intermediate. Give pinyin for new or harder words, allow longer sentences, and introduce natural connectors and register.",
  advanced: "Level: advanced. Use mostly Chinese examples, pinyin only for rare items, and discuss nuance, register, and idiom."
};

const INTENT_GUIDANCE: Record<string, string> = {
  more_examples: "The learner asked for MORE EXAMPLES on the current topic. Keep `answer` to one sentence introducing them and put exactly 6 varied, realistic examples in `examples`.",
  quiz_me: "The learner asked to be QUIZZED on what was just taught. In `answer`, pose 3 short quiz questions (mix translate-to-Chinese and meaning questions), numbered. Put the full answer key in `microExercise`, starting with 'Answer key:'. Do not reveal answers in `answer`.",
  eli5: "Explain as if the learner were five years old: the simplest words, one concrete everyday analogy, zero linguistic jargon.",
  roleplay: "Run a short roleplay. In `answer`, set the scene in one line, speak your first line in Chinese with pinyin and English, then prompt the learner for their reply."
};

export function buildTutorSystemPrompt(input: TutorGenerationInput) {
  const profile = input.profile ?? null;
  const lines: string[] = [
    "You are a personal Mandarin Chinese coach in a daily-practice app. You teach in context, using the learner's real life, and you build on previous turns of this conversation.",
    profile ? STYLE_GUIDANCE[profile.coachStyle] : STYLE_GUIDANCE.friendly,
    profile ? LEVEL_GUIDANCE[profile.level] : LEVEL_GUIDANCE.beginner
  ];

  if (profile) {
    lines.push(
      `Learner goals: ${profile.goals.join(", ") || "not specified"}. Interests: ${profile.interests.join(", ") || "not specified"}. Daily time budget: ${profile.minutesPerDay} minutes.`
    );
  } else if (input.profileSummary) {
    lines.push(`Learner profile: ${input.profileSummary}`);
  }

  if (input.memoryContext.length) {
    lines.push(`Long-term memories about the learner (use naturally, never recite them back):\n- ${input.memoryContext.join("\n- ")}`);
  }

  if (input.planFocus) {
    lines.push(`Today's session focus from the curriculum plan: ${input.planFocus}. Steer toward it when the learner has no specific question, but always answer what they actually asked.`);
  }

  if (input.weakAreas?.length) {
    lines.push(`Known weak areas: ${input.weakAreas.join(", ")}. Weave brief reinforcement in where natural.`);
  }

  if (typeof input.dueCards === "number" && input.dueCards > 0) {
    lines.push(`The learner has ${input.dueCards} review cards due; you may mention review once if relevant, never more.`);
  }

  lines.push(
    "Teaching rules:",
    "- If the learner writes Chinese, first correct any errors (show the corrected version with pinyin) and offer one more natural alternative.",
    "- Format Chinese as 汉字 (pīnyīn) — English the first time each item appears in `answer`.",
    "- `answer` is plain conversational text, no markdown, no bullet symbols, 2-6 sentences (1-3 for concise style). It must fully answer the learner on its own.",
    "- `keyPoints`: 1-4 crisp takeaways. `examples`: 1-6 items formatted exactly '汉字 (pīnyīn) — English'. `microExercise`: one short task the learner can do right now.",
    "- `suggestedReviewItems`: 1-10 vocabulary words or short phrases actually taught in this reply, each formatted exactly 'hanzi (pinyin) - English'. Never full sentences, never grammar labels, never English-only.",
    "- `grammarPoints`: array of { title, explanation, examples, confidence } only for a grammar concept explicitly taught or corrected in this reply with confidence 'high'; otherwise [].",
    "- `topic`: 1-4 lowercase English words naming the theme of this reply (for example 'ordering drinks', 'family routines').",
    input.verifyMode
      ? "- Verify mode is ON: prefer well-attested usage, flag anything regional or uncertain with 'Note:' inside `answer`, and avoid speculation."
      : "- Be accurate; when a usage is regional or debatable, say so briefly.",
    "Output: a single JSON object with keys in this exact order: answer, keyPoints, examples, microExercise, suggestedReviewItems, grammarPoints, topic. No text outside the JSON."
  );

  return lines.join("\n");
}

export function buildTutorMessages(input: TutorGenerationInput): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: buildTutorSystemPrompt(input) }];

  const history = (input.history ?? []).slice(-MAX_HISTORY_MESSAGES);
  if (history.length === 0 && input.recentUserMessages?.length) {
    for (const content of input.recentUserMessages.slice(-3)) {
      messages.push({ role: "user", content: content.slice(0, MAX_HISTORY_CHARS) });
    }
  }
  for (const turn of history) {
    const content = turn.content.length > MAX_HISTORY_CHARS
      ? `${turn.content.slice(0, MAX_HISTORY_CHARS)}…`
      : turn.content;
    messages.push({ role: turn.role, content });
  }

  const intentGuidance = input.intent ? INTENT_GUIDANCE[input.intent] : undefined;
  const userContent = intentGuidance
    ? `${input.message}\n\n[Instruction for this turn: ${intentGuidance}]`
    : input.message;
  messages.push({ role: "user", content: userContent });

  return messages;
}

function parseStructured(content: string) {
  return normalizeStructuredPayload(parseJsonObject(content));
}

function degradedStructured(content: string): TutorStructuredResponse {
  const answer = content.replace(/```[\s\S]*?```/g, "").trim().slice(0, 1200) || "Let me give a concise Mandarin explanation.";
  return normalizeStructuredPayload({ answer, keyPoints: [], examples: [answer], microExercise: "Write one sentence using what you just learned.", suggestedReviewItems: [] });
}

export async function generateTutorStructuredResponse(input: TutorGenerationInput): Promise<TutorStructuredResponse> {
  const result = await generateTutorResponse(input);
  return result.structured;
}

/**
 * Runs the tutor model. Streams the `answer` field to `onDelta` while the full structured
 * JSON is still generating, then validates the complete payload. Retries once without
 * streaming if the first reply is not parseable JSON.
 */
export async function generateTutorResponse(input: TutorGenerationInput): Promise<TutorGenerationResult> {
  const resolvedModel = resolveVeniceModel({
    message: input.message,
    intent: input.intent,
    selectionMode: input.modelSelectionMode,
    customModel: input.customModel,
    modelPreferences: input.modelPreferences,
    defaultSimpleModel: env.veniceSimpleModel,
    defaultComplexModel: env.veniceComplexModel
  });

  const messages = buildTutorMessages(input);
  const temperature = input.verifyMode ? 0.1 : resolvedModel.complexity === "complex" ? 0.35 : 0.3;
  const baseOptions = {
    model: resolvedModel.model,
    temperature,
    json: true,
    maxTokens: 1100,
    reasoning: "none" as const
  };

  const started = Date.now();
  const usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let modelUsed = resolvedModel.model;

  function accumulate(result: { usage: TokenUsage; model: string }) {
    usage.promptTokens += result.usage.promptTokens;
    usage.completionTokens += result.usage.completionTokens;
    usage.totalTokens += result.usage.totalTokens;
    modelUsed = result.model;
  }

  let firstContent = "";
  let firstStreamedAnswer = "";
  try {
    if (input.onDelta) {
      const streamer = createJsonStringFieldStreamer("answer", input.onDelta);
      const first = await streamChatComplete({ ...baseOptions, messages }, (delta) => streamer.push(delta));
      accumulate(first);
      firstContent = first.content;
      firstStreamedAnswer = streamer.value;
    } else {
      const first = await chatComplete({ ...baseOptions, messages });
      accumulate(first);
      firstContent = first.content;
    }
    const structured = parseStructured(firstContent);
    return finish(structured);
  } catch (error) {
    if (!firstContent) throw error;
    // Fall through to a strict retry below.
  }

  const retry = await chatComplete({
    ...baseOptions,
    messages: [
      ...messages,
      { role: "assistant", content: firstContent.slice(0, 2000) },
      { role: "user", content: "That was not valid JSON matching the schema. Return only the JSON object now, nothing else." }
    ]
  });
  accumulate(retry);

  try {
    const structured = parseStructured(retry.content);
    if (input.onDelta && !firstStreamedAnswer && structured.answer) {
      input.onDelta(structured.answer);
    }
    return finish(structured);
  } catch {
    const structured = degradedStructured(retry.content || firstContent);
    if (input.onDelta && !firstStreamedAnswer) input.onDelta(structured.answer);
    return finish(structured);
  }

  function finish(structured: TutorStructuredResponse): TutorGenerationResult {
    return {
      structured,
      model: modelUsed,
      usage,
      latencyMs: Date.now() - started,
      costUsd: estimateModelCostUsd(modelUsed, usage)
    };
  }
}
