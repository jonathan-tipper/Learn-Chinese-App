import { z } from "zod";
import { env, isVeniceEnabled } from "@/lib/env";
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
  suggestedReviewItems: z.array(z.string()).min(1).max(10)
});

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
}) {
  const memories = input.memoryContext.length ? input.memoryContext.join("\n") : "(none)";
  const recentMessages = input.recentUserMessages.length ? input.recentUserMessages.join("\n") : "(none)";

  return [
    `User message: ${input.message}`,
    `Profile summary: ${input.profileSummary}`,
    `Long-term memories:\n${memories}`,
    `Recent user messages:\n${recentMessages}`,
    `Verify mode: ${input.verifyMode ? "enabled" : "disabled"}`,
    "Teach Mandarin in-context. Include concise hanzi + pinyin + English where useful.",
    "Output JSON only with keys: answer, keyPoints, examples, microExercise, suggestedReviewItems."
  ].join("\n\n");
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

  const response = await fetch(`${env.veniceBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.veniceApiKey}`
    },
    body: JSON.stringify({
      model: resolvedModel.model,
      temperature: input.verifyMode ? 0.1 : resolvedModel.complexity === "complex" ? 0.35 : 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a Mandarin tutor coach. Keep responses practical, kind, and concise. Always return valid JSON matching the requested schema."
        },
        {
          role: "user",
          content: `${buildPrompt(input)}\n\nModel selection strategy: ${resolvedModel.strategy}. Complexity: ${resolvedModel.complexity}.`
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Venice request failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Venice response missing content");
  }

  const parsed = JSON.parse(extractJsonObject(content));
  return structuredSchema.parse(parsed);
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
}): Promise<TutorStructuredResponse> {
  return queryVenice(input);
}
