import type { SrsCard } from "@/lib/types";
import { CJK_RE, formatReviewAnswer, parseReviewItem } from "@/server/store/srs";

const LEGACY_PREFIX_RE = /^Translate or use:\s*/i;

/**
 * Cards created before the spoiler fix stored the whole "Translate or use: 茶 (chá) - tea"
 * string as both prompt and answer. Repair them in memory so the review UI is clean even
 * before the database rows are rewritten.
 */
export function isLegacyCard(card: Pick<SrsCard, "prompt" | "answer">) {
  if (LEGACY_PREFIX_RE.test(card.prompt)) return true;
  const stripped = card.prompt.trim();
  return stripped.length > 0 && card.answer.trim() === stripped && CJK_RE.test(stripped) && /[A-Za-z]/.test(stripped);
}

export function repairLegacyCard<T extends Pick<SrsCard, "prompt" | "answer">>(card: T): { card: T; repaired: boolean } {
  if (!isLegacyCard(card)) return { card, repaired: false };

  const source = card.prompt.replace(LEGACY_PREFIX_RE, "").trim();
  const parsed = parseReviewItem(source);
  if (!CJK_RE.test(parsed.chinese) || !parsed.english) {
    return { card, repaired: false };
  }

  return {
    card: { ...card, prompt: parsed.chinese, answer: formatReviewAnswer(parsed) },
    repaired: true
  };
}
