import type { TutorStructuredResponse } from "@/lib/types";

/**
 * Only `suggestedReviewItems` become flashcards: the model formats these as
 * "hanzi (pinyin) - English". Examples and key points are teaching aids.
 */
export function deriveReviewItems(structured: TutorStructuredResponse, userMessage: string, saveToReview?: boolean) {
  const candidates = [...structured.suggestedReviewItems];

  if (saveToReview) {
    candidates.push(userMessage);
  }

  return Array.from(new Set(candidates.map((v) => v.trim()).filter(Boolean))).slice(0, 20);
}
