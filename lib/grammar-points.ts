import type { GrammarPointSignal } from "@/lib/types";

const MAX_GRAMMAR_POINTS = 4;
const MAX_EXAMPLES = 4;

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizeGrammarPointSignals(value: unknown): GrammarPointSignal[] {
  if (!Array.isArray(value)) return [];

  const normalized: GrammarPointSignal[] = [];
  const seen = new Set<string>();

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    if (record.confidence !== "high") continue;

    const title = cleanString(record.title);
    const explanation = cleanString(record.explanation);
    if (!title || !explanation) continue;

    const identity = grammarPointIdentity(title);
    if (seen.has(identity)) continue;
    seen.add(identity);

    const examples = Array.isArray(record.examples)
      ? Array.from(new Set(record.examples.map(cleanString).filter(Boolean))).slice(0, MAX_EXAMPLES)
      : [];

    normalized.push({ title, explanation, examples, confidence: "high" });
    if (normalized.length >= MAX_GRAMMAR_POINTS) break;
  }

  return normalized;
}

export function grammarPointIdentity(title: string) {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
