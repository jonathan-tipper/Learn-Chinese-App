import { z } from "zod";
import { env, isVeniceEnabled } from "@/lib/env";
import type { MemoryItem, Profile } from "@/lib/types";
import { addMemory } from "@/server/store";
import { type TokenUsage, chatComplete, estimateModelCostUsd, parseJsonObject } from "@/server/llm/venice";

/**
 * Memory Curator agent: after each tutor turn, extracts durable facts about the learner
 * (life context, goals, preferences, recurring struggles) so the coach builds a real
 * relationship instead of relying on explicit "remember X: Y" commands.
 */

const MEMORY_TYPES = ["goal", "preference", "topic", "vocab"] as const;

const candidateSchema = z.object({
  type: z.enum(MEMORY_TYPES),
  key: z.string().min(2).max(60),
  value: z.string().min(2).max(240)
});

export type MemoryCandidate = z.infer<typeof candidateSchema>;

export interface CurateMemoriesInput {
  userId: string;
  message: string;
  answer: string;
  existing: MemoryItem[];
  profile?: Profile | null;
  model?: string;
}

export interface CurateMemoriesResult {
  saved: MemoryItem[];
  skippedReason?: "too_short" | "provider_disabled" | "error" | "nothing_new";
  usage?: TokenUsage;
  model?: string;
  costUsd?: number;
  latencyMs?: number;
}

const MIN_MESSAGE_LENGTH = 20;
const MAX_NEW_MEMORIES = 3;

function normalizeKey(key: string) {
  return key.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ");
}

function normalizeValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Pure, testable: parse model output and drop anything already known or malformed. */
export function normalizeMemoryCandidates(raw: unknown, existing: Pick<MemoryItem, "key" | "value">[]): MemoryCandidate[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { memories?: unknown }).memories)
    ? ((raw as { memories: unknown[] }).memories)
    : [];

  const knownKeys = new Set(existing.map((item) => normalizeKey(item.key)));
  const knownValues = new Set(existing.map((item) => normalizeValue(item.value)));
  const accepted: MemoryCandidate[] = [];

  for (const rawCandidate of list.slice(0, 8)) {
    // Validate per item so one malformed entry does not discard the rest.
    const result = candidateSchema.safeParse(rawCandidate);
    if (!result.success) continue;
    const candidate = result.data;
    const key = candidate.key.trim().replace(/\s+/g, " ");
    const value = candidate.value.trim().replace(/\s+/g, " ");
    if (!key || !value) continue;
    const keyId = normalizeKey(key);
    const valueId = normalizeValue(value);
    if (!keyId || knownKeys.has(keyId) || knownValues.has(valueId)) continue;
    knownKeys.add(keyId);
    knownValues.add(valueId);
    accepted.push({ type: candidate.type, key, value });
    if (accepted.length >= MAX_NEW_MEMORIES) break;
  }

  return accepted;
}

export function shouldCurateMemories(message: string) {
  return message.trim().length >= MIN_MESSAGE_LENGTH;
}

function buildPrompt(input: CurateMemoriesInput) {
  const existing = input.existing.length
    ? input.existing.slice(0, 40).map((item) => `- [${item.type}] ${item.key}: ${item.value}`).join("\n")
    : "(none yet)";
  const profile = input.profile
    ? `goals=${input.profile.goals.join(", ")}; interests=${input.profile.interests.join(", ")}; level=${input.profile.level}`
    : "(no profile)";

  return [
    "Existing long-term memories:",
    existing,
    `Profile already stored separately: ${profile}`,
    "",
    "Latest exchange:",
    `LEARNER: ${input.message.slice(0, 1500)}`,
    `COACH: ${input.answer.slice(0, 1200)}`,
    "",
    "Extract 0-3 NEW facts about the learner that will still matter in future sessions.",
    "Good: life context (family, job, city, upcoming trip, routines), how they like to learn, a concrete goal, a phrase or sound they keep struggling with.",
    "Bad: anything already in the existing memories or profile, vocabulary the coach taught, generic statements, facts about the coach's answer, one-off requests.",
    "Types: goal (what they want to achieve), preference (how they like to learn), topic (life context to weave into lessons), vocab (a specific word/sound they struggle with).",
    "key: a short label under 40 characters. value: one plain sentence.",
    "Return JSON only: {\"memories\":[{\"type\":\"topic\",\"key\":\"...\",\"value\":\"...\"}]} or {\"memories\":[]} when nothing qualifies."
  ].join("\n");
}

export async function curateMemories(input: CurateMemoriesInput): Promise<CurateMemoriesResult> {
  if (!shouldCurateMemories(input.message)) {
    return { saved: [], skippedReason: "too_short" };
  }
  if (!isVeniceEnabled()) {
    return { saved: [], skippedReason: "provider_disabled" };
  }

  const model = input.model ?? env.veniceSimpleModel;

  try {
    const result = await chatComplete({
      model,
      json: true,
      temperature: 0.1,
      maxTokens: 320,
      timeoutMs: 20_000,
      messages: [
        {
          role: "system",
          content: "You maintain the long-term memory of a Mandarin coaching app. You are conservative: you only store facts about the learner that are durable, specific, and new. Always return valid JSON."
        },
        { role: "user", content: buildPrompt(input) }
      ]
    });

    const candidates = normalizeMemoryCandidates(parseJsonObject(result.content), input.existing);
    const saved: MemoryItem[] = [];
    for (const candidate of candidates) {
      saved.push(await addMemory(input.userId, candidate.key, candidate.value, candidate.type));
    }

    return {
      saved,
      skippedReason: saved.length ? undefined : "nothing_new",
      usage: result.usage,
      model: result.model,
      costUsd: estimateModelCostUsd(result.model, result.usage),
      latencyMs: result.latencyMs
    };
  } catch (error) {
    console.warn("Memory curator skipped:", error instanceof Error ? error.message : error);
    return { saved: [], skippedReason: "error" };
  }
}
