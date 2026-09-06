import type { SrsGrade } from "@/lib/types";

/**
 * Detect whether a string contains CJK (Chinese/Japanese/Korean) characters.
 */
export const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

/**
 * Parse a review item string like "请 (qǐng) - please" into structured parts.
 * Returns { chinese, pinyin, english } so we can build spoiler-free flashcards.
 */
export function parseReviewItem(item: string): { chinese: string; pinyin: string; english: string } {
  // Pattern: "Chinese (pinyin) - English" or "Chinese — English"
  const full = item.match(/^(.+?)\s*\(([^)]+)\)\s*[-—–]\s*(.+)$/);
  if (full) {
    return { chinese: full[1].trim(), pinyin: full[2].trim(), english: full[3].trim() };
  }

  // Pattern: "Chinese - English" (no pinyin)
  const noPinyin = item.match(/^(.+?)\s*[-—–]\s*(.+)$/);
  if (noPinyin) {
    const left = noPinyin[1].trim();
    const right = noPinyin[2].trim();
    // Only split if left side has CJK and right side doesn't (i.e. right is English)
    if (CJK_RE.test(left) && !CJK_RE.test(right)) {
      return { chinese: left, pinyin: "", english: right };
    }
  }

  // Pattern: "Chinese (English meaning)" — no dash, English in trailing parens
  const trailingParens = item.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (trailingParens) {
    const left = trailingParens[1].trim();
    const right = trailingParens[2].trim();
    if (CJK_RE.test(left) && !CJK_RE.test(right)) {
      return { chinese: left, pinyin: "", english: right };
    }
  }

  // No separable English — return the whole item as Chinese
  return { chinese: item, pinyin: "", english: "" };
}

export function formatReviewAnswer(parsed: { pinyin: string; english: string }) {
  return parsed.pinyin ? `${parsed.pinyin} — ${parsed.english}` : parsed.english;
}

export function isValidReviewItem(parsed: { chinese: string; english: string }) {
  return CJK_RE.test(parsed.chinese) && parsed.english.trim().length > 0 && parsed.chinese.trim() !== parsed.english.trim();
}

export function parseVocabItem(item: string) {
  const parsed = parseReviewItem(item);
  if (!isValidReviewItem(parsed)) return null;

  return {
    hanzi: parsed.chinese.trim(),
    pinyin: parsed.pinyin.trim() || undefined,
    english: parsed.english.trim() || undefined
  };
}

export function vocabItemIdentity(hanzi: string, pinyin?: string) {
  return `${hanzi.trim().toLocaleLowerCase()}|${(pinyin ?? "").trim().toLocaleLowerCase()}`;
}

export function srsCardIdentity(prompt: string, answer: string) {
  return `${prompt.trim().toLocaleLowerCase()}|${answer.trim().toLocaleLowerCase()}`;
}

export function computeScheduling(currentInterval: number, currentEase: number, grade: SrsGrade) {
  const easeDelta: Record<SrsGrade, number> = {
    again: -0.2,
    hard: -0.05,
    good: 0.05,
    easy: 0.15
  };

  const nextEase = Math.max(1.3, Number((currentEase + easeDelta[grade]).toFixed(2)));

  let nextInterval = 1;
  if (grade === "again") {
    nextInterval = 1;
  } else if (grade === "hard") {
    nextInterval = Math.max(1, Math.round(currentInterval * 1.2));
  } else if (grade === "good") {
    nextInterval = Math.max(2, Math.round(currentInterval * nextEase));
  } else {
    nextInterval = Math.max(3, Math.round(currentInterval * nextEase * 1.3));
  }

  const nextDueAt = new Date(Date.now() + nextInterval * 24 * 60 * 60 * 1000).toISOString();

  return {
    interval: nextInterval,
    ease: nextEase,
    nextDueAt
  };
}

export interface SrsCardContext {
  /** Example sentences from the tutor reply, used to build answer-safe cloze hints. */
  examples?: string[];
  /** Extra tags such as the reply topic; "auto-generated" is always added. */
  tags?: string[];
}

const DEFAULT_HINT = "Recall context from your last session";
const CLOZE_MARK = "＿＿";

/** Return only the Chinese sentence portion of an example like "我想点一杯茶。 (I want tea.)". */
export function chineseSentenceFromExample(example: string) {
  const cut = example.split(/[(（—–-]|\s[-]\s/)[0]?.trim() ?? "";
  if (!CJK_RE.test(cut)) return "";
  // Drop trailing latin/pinyin fragments that survived the split.
  return cut.replace(/[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ0-9,.!?;:'"\s]+$/u, "").trim();
}

/**
 * Build hints that help recall without revealing the answer: a cloze of the sentence the
 * word appeared in, falling back to the topic it came up under.
 */
export function buildAnswerSafeHints(chinese: string, context: SrsCardContext = {}) {
  const term = chinese.trim();
  const hints: string[] = [];

  for (const example of context.examples ?? []) {
    const sentence = chineseSentenceFromExample(example);
    if (!sentence || !sentence.includes(term) || sentence.replace(term, "").length < 2) continue;
    hints.push(`Fill the gap: ${sentence.split(term).join(CLOZE_MARK)}`);
    break;
  }

  const topic = (context.tags ?? []).find((tag) => tag && tag !== "auto-generated");
  if (topic) {
    hints.push(`Came up while practising: ${topic}`);
  }

  return hints.length ? hints.slice(0, 2) : [DEFAULT_HINT];
}

export function buildCardTags(context: SrsCardContext = {}) {
  const tags = new Set<string>(["auto-generated"]);
  for (const tag of context.tags ?? []) {
    const cleaned = tag.trim().toLowerCase().slice(0, 40);
    if (cleaned) tags.add(cleaned);
  }
  return Array.from(tags);
}

/** A card counts as mastered once it is comfortably scheduled weeks out. */
export function isMasteredCard(card: { ease: number; interval: number }) {
  return card.ease >= 3.0 && card.interval >= 21;
}
