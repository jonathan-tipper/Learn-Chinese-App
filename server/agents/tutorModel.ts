import { z } from "zod";
import { env, isVeniceEnabled } from "@/lib/env";
import { normalizeGrammarPointSignals } from "@/lib/grammar-points";
import type { TutorStructuredResponse } from "@/lib/types";
import {
  type ModelSelectionMode,
  type VeniceModelPreferences,
  resolveVeniceModel
} from "@/lib/venice";

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
  })).max(4).default([])
});

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

function normalizeStructuredPayload(raw: unknown) {
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

  return {
    answer,
    keyPoints,
    examples,
    microExercise,
    suggestedReviewItems,
    grammarPoints
  };
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return text;
}

function buildPrompt(input: {
  message: string;
  memoryContext: string[];
  profileSummary: string;
  recentUserMessages: string[];
  verifyMode?: boolean;
  planSnippet?: string;
}) {
  const memories = input.memoryContext.length ? input.memoryContext.join("\n") : "(none)";
  const recentMessages = input.recentUserMessages.length ? input.recentUserMessages.join("\n") : "(none)";

  const lines = [
    `User message: ${input.message}`,
    `Profile summary: ${input.profileSummary}`,
    `Long-term memories:\n${memories}`,
    `Recent user messages:\n${recentMessages}`,
    `Verify mode: ${input.verifyMode ? "enabled" : "disabled"}`
  ];

  if (input.planSnippet) {
    lines.push(`Today's session focus: ${input.planSnippet}`);
  }

  lines.push(
    "Teach Mandarin in-context. Include concise hanzi + pinyin + English where useful.",
    "Output JSON only with keys: answer, keyPoints, examples, microExercise, suggestedReviewItems, grammarPoints.",
    "Constraints: keyPoints max 4 items, examples max 6 items, suggestedReviewItems max 10 items, grammarPoints max 4 items.",
    "grammarPoints must be an array of { title, explanation, examples, confidence }. Include an item only for a grammar concept explicitly taught or corrected in this response, and only when confidence is 'high'; otherwise return an empty array. Do not infer or invent a rule.",
    "IMPORTANT: Each suggestedReviewItem MUST use this exact format: 'hanzi (pinyin) - English meaning'.",
    "Examples of correct suggestedReviewItems: '请 (qǐng) - please', '谢谢 (xiè xiè) - thank you', '咖啡 (kā fēi) - coffee'.",
    "Only include individual vocabulary words or short phrases in suggestedReviewItems — NOT full sentences, NOT grammar concepts, NOT English-only text."
  );

  return lines.join("\n\n");
}

type VeniceMessageContent = string | Array<string | { text?: unknown; type?: unknown }> | null;

type VeniceChatPayload = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: VeniceMessageContent;
      reasoning_content?: unknown;
    };
  }>;
};

function readAssistantContent(payload: VeniceChatPayload) {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    const cleaned = content.trim();
    return cleaned ? cleaned : null;
  }

  if (Array.isArray(content)) {
    const cleaned = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof part.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();

    return cleaned ? cleaned : null;
  }

  return null;
}

function hasReasoningWithoutContent(payload: VeniceChatPayload) {
  return Boolean(payload.choices?.[0]?.message?.reasoning_content);
}

function buildVeniceRequestBody(input: {
  message: string;
  intent?: string;
  memoryContext: string[];
  profileSummary: string;
  recentUserMessages: string[];
  verifyMode?: boolean;
  planSnippet?: string;
}, resolvedModel: ReturnType<typeof resolveVeniceModel>, retryWithoutReasoning: boolean) {
  const prompt = `${buildPrompt(input)}\n\nModel selection strategy: ${resolvedModel.strategy}. Complexity: ${resolvedModel.complexity}.`;

  return {
    model: resolvedModel.model,
    temperature: input.verifyMode ? 0.1 : resolvedModel.complexity === "complex" ? 0.35 : 0.25,
    response_format: { type: "json_object" },
    ...(retryWithoutReasoning
      ? {
        venice_parameters: {
          disable_thinking: true,
          strip_thinking_response: true
        }
      }
      : {}),
    messages: [
      {
        role: "system",
        content:
          "You are a Mandarin tutor coach. Keep responses practical, kind, and concise. Always return valid JSON matching the requested schema."
      },
      {
        role: "user",
        content: retryWithoutReasoning
          ? `${prompt}\n\nReturn only the final JSON object in message.content. Do not put the answer in reasoning_content.`
          : prompt
      }
    ]
  };
}

async function queryVenice(input: {
  message: string;
  intent?: string;
  memoryContext: string[];
  profileSummary: string;
  recentUserMessages: string[];
  verifyMode?: boolean;
  modelSelectionMode?: ModelSelectionMode;
  customModel?: string;
  modelPreferences?: VeniceModelPreferences;
  planSnippet?: string;
}): Promise<TutorStructuredResponse> {
  if (!isVeniceEnabled()) {
    throw new Error("Venice API key is required for tutor reasoning.");
  }

  const resolvedModel = resolveVeniceModel({
    message: input.message,
    intent: input.intent,
    selectionMode: input.modelSelectionMode,
    customModel: input.customModel,
    modelPreferences: input.modelPreferences,
    defaultSimpleModel: env.veniceSimpleModel,
    defaultComplexModel: env.veniceComplexModel
  });

  let missingContentWithReasoning = false;

  for (const retryWithoutReasoning of [false, true]) {
    if (retryWithoutReasoning && !missingContentWithReasoning) break;

    const response = await fetch(`${env.veniceBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.veniceApiKey}`
      },
      body: JSON.stringify(buildVeniceRequestBody(input, resolvedModel, retryWithoutReasoning))
    });

    if (!response.ok) {
      throw new Error(`Venice request failed (${response.status})`);
    }

    const payload = (await response.json()) as VeniceChatPayload;
    const content = readAssistantContent(payload);
    if (content) {
      const parsed = JSON.parse(extractJsonObject(content));
      return structuredSchema.parse(normalizeStructuredPayload(parsed));
    }

    missingContentWithReasoning = hasReasoningWithoutContent(payload);
  }

  throw new Error("Venice response missing content");
}

export async function generateTutorStructuredResponse(input: {
  message: string;
  intent?: string;
  memoryContext: string[];
  profileSummary: string;
  recentUserMessages: string[];
  verifyMode?: boolean;
  modelSelectionMode?: ModelSelectionMode;
  customModel?: string;
  modelPreferences?: VeniceModelPreferences;
  planSnippet?: string;
}): Promise<TutorStructuredResponse> {
  return queryVenice(input);
}
