import { z } from "zod";
import { env, isVeniceEnabled } from "@/lib/env";
import type { SpeakingPrompt } from "@/lib/pronunciation";
import type { LearningPlanItem, Profile } from "@/lib/types";
import { getTodayPlanFocus, localDateString } from "@/server/agents/curriculumPlanner";
import { getProfile, listVocabItems, updateLearningPlan } from "@/server/store";
import { chatComplete, parseJsonObject } from "@/server/llm/venice";

/**
 * Speaking prompts: short sentences the learner can say aloud today, drawn from today's
 * plan item and the vocabulary they have actually met. Cached per user per day (inside the
 * plan item when a plan exists, otherwise in process memory).
 */


const promptSchema = z.object({
  hanzi: z.string().min(2).max(24),
  pinyin: z.string().min(2).max(120),
  english: z.string().min(2).max(160)
});


const CJK_RE = /^[一-鿿㐀-䶿，。！？、]{3,16}$/u;

export const FALLBACK_PROMPTS: SpeakingPrompt[] = [
  { hanzi: "我今天想点一杯茶。", pinyin: "Wǒ jīntiān xiǎng diǎn yì bēi chá.", english: "I want to order a cup of tea today.", source: "fallback" },
  { hanzi: "你好，我叫什么名字？", pinyin: "Nǐ hǎo, wǒ jiào shénme míngzi?", english: "Hello, what is my name? (practice the question form)", source: "fallback" },
  { hanzi: "请给我一杯水。", pinyin: "Qǐng gěi wǒ yì bēi shuǐ.", english: "Please give me a glass of water.", source: "fallback" },
  { hanzi: "今天天气很好。", pinyin: "Jīntiān tiānqì hěn hǎo.", english: "The weather is nice today.", source: "fallback" }
];

type CacheEntry = { date: string; prompts: SpeakingPrompt[] };
const CACHE_KEY = Symbol.for("learn-chinese.speaking-prompts");
function cache(): Map<string, CacheEntry> {
  const holder = globalThis as unknown as Record<symbol, Map<string, CacheEntry> | undefined>;
  if (!holder[CACHE_KEY]) holder[CACHE_KEY] = new Map();
  return holder[CACHE_KEY];
}

export function normalizeSpeakingPrompts(raw: unknown, source: SpeakingPrompt["source"]): SpeakingPrompt[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { prompts?: unknown }).prompts)
    ? (raw as { prompts: unknown[] }).prompts
    : [];
  const seen = new Set<string>();
  const prompts: SpeakingPrompt[] = [];
  for (const candidate of list.slice(0, 10)) {
    // Validate per item so one malformed prompt does not discard the rest.
    const parsed = promptSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const item = parsed.data;
    const hanzi = item.hanzi.trim();
    if (!CJK_RE.test(hanzi) || seen.has(hanzi)) continue;
    seen.add(hanzi);
    prompts.push({ hanzi, pinyin: item.pinyin.trim(), english: item.english.trim(), source });
  }
  return prompts.slice(0, 5);
}

function buildPrompt(input: { profile: Profile | null; planItem?: LearningPlanItem; vocab: string[]; count: number }) {
  const level = input.profile?.level ?? "beginner";
  const lengths = level === "beginner" ? "3-8 characters" : level === "intermediate" ? "5-12 characters" : "8-16 characters";
  return [
    `Write ${input.count} natural spoken Mandarin sentences a ${level} learner can say aloud today.`,
    input.planItem
      ? `Today's lesson focus: ${input.planItem.title} — ${input.planItem.lessonFocus} Goal: ${input.planItem.canDo}.`
      : "Focus: everyday situations (greetings, ordering, family, time).",
    input.vocab.length ? `Reuse these words the learner already met where natural: ${input.vocab.join(", ")}.` : "",
    `Each sentence ${lengths}, simplified characters, ending with 。or ？. Vary the sentence patterns. No romanised text inside hanzi.`,
    "Return JSON only: {\"prompts\":[{\"hanzi\":\"…\",\"pinyin\":\"… with tone marks\",\"english\":\"…\"}]}"
  ].filter(Boolean).join("\n");
}

export type { SpeakingPrompt };

export async function getSpeakingPrompts(userId: string, options: { count?: number; force?: boolean } = {}) {
  const count = Math.min(6, Math.max(2, options.count ?? 4));
  const [profile, today] = await Promise.all([getProfile(userId), getTodayPlanFocus(userId).catch(() => null)]);
  const date = localDateString(new Date(), profile?.timezone);
  const cacheKey = `${userId}:${date}`;

  if (!options.force) {
    const planPrompts = (today?.item as (LearningPlanItem & { speakingPrompts?: SpeakingPrompt[] }) | undefined)?.speakingPrompts;
    if (planPrompts?.length) return { prompts: planPrompts, source: "plan" as const, cached: true };
    const cached = cache().get(cacheKey);
    if (cached && cached.date === date) return { prompts: cached.prompts, source: cached.prompts[0]?.source ?? "fallback", cached: true };
  }

  if (!isVeniceEnabled()) {
    return { prompts: FALLBACK_PROMPTS.slice(0, count), source: "fallback" as const, cached: false };
  }

  const vocab = (await listVocabItems(userId).catch(() => [])).slice(0, 12).map((item) => item.hanzi);
  const source: SpeakingPrompt["source"] = today?.item ? "plan" : vocab.length ? "vocab" : "fallback";

  try {
    const result = await chatComplete({
      model: env.veniceSimpleModel,
      json: true,
      temperature: 0.5,
      maxTokens: 500,
      timeoutMs: 25_000,
      messages: [
        { role: "system", content: "You write short, natural Mandarin sentences for speaking practice. Always return valid JSON." },
        { role: "user", content: buildPrompt({ profile, planItem: today?.item, vocab, count }) }
      ]
    });
    const prompts = normalizeSpeakingPrompts(parseJsonObject(result.content), source);
    if (!prompts.length) throw new Error("No usable prompts");

    cache().set(cacheKey, { date, prompts });
    if (today?.plan && today.item) {
      const items = today.plan.items.map((item) =>
        item.date === today.item.date ? { ...item, speakingPrompts: prompts } : item
      );
      await updateLearningPlan({ ...today.plan, items }).catch(() => undefined);
    }
    return { prompts, source, cached: false };
  } catch (error) {
    console.warn("Speaking prompts fell back:", error instanceof Error ? error.message : error);
    return { prompts: FALLBACK_PROMPTS.slice(0, count), source: "fallback" as const, cached: false };
  }
}
