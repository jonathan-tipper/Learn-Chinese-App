import type { SrsGrade } from "@/lib/types";

/**
 * Detect whether a string contains CJK (Chinese/Japanese/Korean) characters.
 */
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

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
