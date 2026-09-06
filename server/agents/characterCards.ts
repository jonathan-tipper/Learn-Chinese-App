import { z } from "zod";
import { env, isVeniceEnabled } from "@/lib/env";
import type { CharacterCard } from "@/lib/types";
import { getCachedCharacterCard, saveCharacterCard } from "@/server/store";
import { type TokenUsage, chatComplete, estimateModelCostUsd, parseJsonObject } from "@/server/llm/venice";

/**
 * Character card agent: turns a studied hanzi entry into a structured learning card
 * (radicals, components, mnemonic, common words, example). Cards are cached globally
 * because the content is not learner-specific.
 */

const CJK_ENTRY_RE = /^[一-鿿㐀-䶿]{1,4}$/;

const breakdownSchema = z.object({
  hanzi: z.string().min(1).max(2),
  pinyin: z.string().min(1).max(20),
  meaning: z.string().min(1).max(120),
  radical: z.string().min(1).max(12),
  radicalMeaning: z.string().min(1).max(80),
  components: z.string().min(1).max(300),
  mnemonic: z.string().min(1).max(320),
  strokeCount: z.number().int().min(1).max(64).optional().nullable()
});

const wordSchema = z.object({
  hanzi: z.string().min(1).max(12),
  pinyin: z.string().min(1).max(60),
  english: z.string().min(1).max(120)
});

const cardSchema = z.object({
  pinyin: z.string().min(1).max(60),
  meaning: z.string().min(1).max(160),
  characters: z.array(breakdownSchema).min(1).max(4),
  commonWords: z.array(wordSchema).max(6).default([]),
  exampleSentence: z.object({
    hanzi: z.string().min(1).max(60),
    pinyin: z.string().min(1).max(200),
    english: z.string().min(1).max(200)
  }),
  usageTip: z.string().max(300).default("")
});

export function isValidCharacterEntry(entry: string) {
  return CJK_ENTRY_RE.test(entry.trim());
}

type Loose = Record<string, unknown>;

function asRecord(value: unknown): Loose {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Loose) : {};
}

function pick(record: Loose, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return value;
  }
  return undefined;
}

function pickNumber(record: Loose, keys: string[]) {
  const value = pick(record, keys);
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

/**
 * Models are inconsistent about key names ("english" vs "meaning", "word" vs "hanzi").
 * Map the common variants onto the schema before validating.
 */
export function coerceCharacterCardPayload(raw: unknown): unknown {
  const root = asRecord(raw);
  const characters = Array.isArray(root.characters) ? root.characters : Array.isArray(root.breakdown) ? root.breakdown : [];
  const words = Array.isArray(root.commonWords) ? root.commonWords : Array.isArray(root.words) ? root.words : Array.isArray(root.common_words) ? root.common_words : [];
  const sentence = asRecord(root.exampleSentence ?? root.example ?? root.example_sentence ?? root.sentence);

  return {
    pinyin: pick(root, ["pinyin", "pronunciation"]),
    meaning: pick(root, ["meaning", "english", "definition", "gloss", "translation"]),
    characters: characters.map((item) => {
      const record = asRecord(item);
      const radical = asRecord(record.radical);
      return {
        hanzi: pick(record, ["hanzi", "character", "char", "chinese"]),
        pinyin: pick(record, ["pinyin", "pronunciation"]),
        meaning: pick(record, ["meaning", "english", "definition", "gloss", "coreMeaning", "core_meaning", "translation"]),
        radical: typeof record.radical === "string" ? record.radical : pick(radical, ["hanzi", "radical", "character", "symbol"]),
        radicalMeaning: pick(record, ["radicalMeaning", "radical_meaning"]) ?? pick(radical, ["meaning", "english"]),
        components: pick(record, ["components", "composition", "structure", "breakdown"]),
        mnemonic: pick(record, ["mnemonic", "memoryAid", "memory_aid", "story"]),
        strokeCount: pickNumber(record, ["strokeCount", "stroke_count", "strokes"]) ?? null
      };
    }),
    commonWords: words.map((item) => {
      const record = asRecord(item);
      return {
        hanzi: pick(record, ["hanzi", "word", "chinese", "characters", "term"]),
        pinyin: pick(record, ["pinyin", "pronunciation"]),
        english: pick(record, ["english", "meaning", "definition", "gloss", "translation"])
      };
    }),
    exampleSentence: {
      hanzi: pick(sentence, ["hanzi", "chinese", "sentence", "text", "zh"]),
      pinyin: pick(sentence, ["pinyin", "pronunciation"]),
      english: pick(sentence, ["english", "meaning", "translation", "gloss", "en"])
    },
    usageTip: pick(root, ["usageTip", "usage_tip", "tip", "usage", "note"]) ?? ""
  };
}

/** Pure: validate and tidy model output into a CharacterCard. */
export function normalizeCharacterCard(raw: unknown, entry: string, meta: { generatedBy: string; generatedAt?: string }): CharacterCard {
  const parsed = cardSchema.parse(coerceCharacterCardPayload(raw));
  const chars = Array.from(entry);

  const characters = chars.map((hanzi, index) => {
    const match = parsed.characters.find((item) => item.hanzi === hanzi) ?? parsed.characters[index];
    return {
      hanzi,
      pinyin: match?.pinyin.trim() ?? "",
      meaning: match?.meaning.trim() ?? "",
      radical: match?.radical.trim() ?? "",
      radicalMeaning: match?.radicalMeaning.trim() ?? "",
      components: match?.components.trim() ?? "",
      mnemonic: match?.mnemonic.trim() ?? "",
      strokeCount: match?.strokeCount ?? undefined
    };
  });

  const commonWords = parsed.commonWords
    .map((word) => ({ hanzi: word.hanzi.trim(), pinyin: word.pinyin.trim(), english: word.english.trim() }))
    .filter((word) => word.hanzi && word.hanzi !== entry)
    .slice(0, 5);

  return {
    entry,
    pinyin: parsed.pinyin.trim(),
    meaning: parsed.meaning.trim(),
    characters,
    commonWords,
    exampleSentence: {
      hanzi: parsed.exampleSentence.hanzi.trim(),
      pinyin: parsed.exampleSentence.pinyin.trim(),
      english: parsed.exampleSentence.english.trim()
    },
    usageTip: parsed.usageTip.trim(),
    generatedBy: meta.generatedBy,
    generatedAt: meta.generatedAt ?? new Date().toISOString()
  };
}

function buildPrompt(entry: string, hints: { pinyin?: string; english?: string }) {
  const known = [hints.pinyin ? `pinyin seen in the app: ${hints.pinyin}` : "", hints.english ? `gloss seen in the app: ${hints.english}` : ""]
    .filter(Boolean)
    .join("; ");

  return [
    `Create a learning card for the Mandarin entry: ${entry}${known ? ` (${known})` : ""}.`,
    "Audience: an adult beginner-to-intermediate learner who wants to recognise and remember it.",
    "For EACH character in the entry give: hanzi, pinyin with tone marks, core meaning, its Kangxi radical and the radical's meaning, a short 'components' explanation of how the parts combine (<=30 words), a vivid mnemonic that links the components to the meaning (<=35 words, concrete imagery, no puns that only work in English spelling), and strokeCount if you are certain (otherwise omit it).",
    "Then give 3-5 commonWords that contain the whole entry (or, for a single character, common words built with it), each with pinyin and English, ordered by frequency.",
    "Give one exampleSentence using the entry: beginner-friendly, <=12 characters, with pinyin and English.",
    "Give a usageTip (<=30 words): register, a collocation, or a mistake learners make.",
    "Accuracy matters more than completeness. Never invent radicals or words. Use simplified characters.",
    "Return JSON only, using EXACTLY this shape and these key names:",
    JSON.stringify({
      pinyin: "…",
      meaning: "…",
      characters: [{ hanzi: "…", pinyin: "…", meaning: "…", radical: "…", radicalMeaning: "…", components: "…", mnemonic: "…", strokeCount: 0 }],
      commonWords: [{ hanzi: "…", pinyin: "…", english: "…" }],
      exampleSentence: { hanzi: "…", pinyin: "…", english: "…" },
      usageTip: "…"
    })
  ].join("\n");
}

const inFlight = new Map<string, Promise<CharacterCardResult>>();

export interface CharacterCardResult {
  card: CharacterCard;
  cached: boolean;
  usage?: TokenUsage;
  costUsd?: number;
  model?: string;
}

export async function getOrCreateCharacterCard(
  rawEntry: string,
  options: { force?: boolean; pinyin?: string; english?: string; model?: string } = {}
): Promise<CharacterCardResult> {
  const entry = rawEntry.trim();
  if (!isValidCharacterEntry(entry)) {
    throw new Error("Character cards are available for entries of 1 to 4 Chinese characters.");
  }

  if (!options.force) {
    const cached = await getCachedCharacterCard(entry);
    if (cached) return { card: cached, cached: true };
  }

  const pending = inFlight.get(entry);
  if (pending) return pending;

  const task = (async () => {
    try {
      if (!isVeniceEnabled()) {
        throw new Error("Character cards require the Venice API. Set VENICE_API_KEY.");
      }

      const result = await chatComplete({
        model: options.model ?? env.veniceComplexModel,
        json: true,
        temperature: 0.2,
        maxTokens: 1200,
        timeoutMs: 60_000,
        messages: [
          {
            role: "system",
            content: "You are a meticulous teacher of Chinese characters (汉字) with deep knowledge of radicals, etymology and modern usage. Always return valid JSON."
          },
          { role: "user", content: buildPrompt(entry, options) }
        ]
      });

      let card: CharacterCard;
      try {
        card = normalizeCharacterCard(parseJsonObject(result.content), entry, { generatedBy: result.model });
      } catch (error) {
        console.warn("Character card payload rejected", { entry, model: result.model, sample: result.content.slice(0, 400) });
        throw error;
      }
      await saveCharacterCard(card);
      return {
        card,
        cached: false,
        usage: result.usage,
        model: result.model,
        costUsd: estimateModelCostUsd(result.model, result.usage)
      };
    } finally {
      inFlight.delete(entry);
    }
  })();

  inFlight.set(entry, task);
  return task;
}
