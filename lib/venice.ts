export const DEFAULT_SIMPLE_MODEL = "zai-org-glm-4.7";
export const DEFAULT_COMPLEX_MODEL = "zai-org-glm-5";

export const VENICE_MODEL_OPTIONS = [
  DEFAULT_SIMPLE_MODEL,
  DEFAULT_COMPLEX_MODEL,
  "qwen-2.5-72b-instruct",
  "meta-llama/llama-3.3-70b-instruct"
] as const;

export type ActivityComplexity = "simple" | "complex";
export type ModelSelectionMode = "auto" | "simple" | "complex" | "custom";

export interface VeniceModelPreferences {
  preferredSimpleModel?: string;
  preferredComplexModel?: string;
}

function cleanModelId(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function classifyActivityComplexity(input: { message: string; intent?: string }): ActivityComplexity {
  const text = `${input.message} ${input.intent ?? ""}`.toLowerCase();

  const complexSignals = [
    "explain",
    "why",
    "grammar",
    "compare",
    "difference",
    "analyze",
    "conversation",
    "roleplay",
    "correction",
    "plan",
    "curriculum",
    "advanced"
  ];

  const simpleSignals = ["translate", "quiz", "example", "vocab", "flashcard", "pinyin"];

  const complexMatch = complexSignals.some((signal) => text.includes(signal));
  const simpleMatch = simpleSignals.some((signal) => text.includes(signal));

  if (complexMatch && !simpleMatch) return "complex";
  if (simpleMatch && !complexMatch && text.length < 140) return "simple";

  return text.length > 220 ? "complex" : "simple";
}

export function resolveVeniceModel(input: {
  message: string;
  intent?: string;
  selectionMode?: ModelSelectionMode;
  customModel?: string;
  modelPreferences?: VeniceModelPreferences;
  defaultSimpleModel?: string;
  defaultComplexModel?: string;
}) {
  const preferredSimple = cleanModelId(input.modelPreferences?.preferredSimpleModel)
    ?? cleanModelId(input.defaultSimpleModel)
    ?? DEFAULT_SIMPLE_MODEL;
  const preferredComplex = cleanModelId(input.modelPreferences?.preferredComplexModel)
    ?? cleanModelId(input.defaultComplexModel)
    ?? DEFAULT_COMPLEX_MODEL;
  const customModel = cleanModelId(input.customModel);

  if (input.selectionMode === "custom") {
    if (!customModel) {
      throw new Error("Custom model mode requires a custom model id.");
    }
    return { model: customModel, complexity: classifyActivityComplexity(input), strategy: "custom" as const };
  }

  if (input.selectionMode === "simple") {
    return { model: preferredSimple, complexity: "simple" as const, strategy: "forced_simple" as const };
  }

  if (input.selectionMode === "complex") {
    return { model: preferredComplex, complexity: "complex" as const, strategy: "forced_complex" as const };
  }

  const complexity = classifyActivityComplexity(input);
  return {
    model: complexity === "complex" ? preferredComplex : preferredSimple,
    complexity,
    strategy: "auto" as const
  };
}
