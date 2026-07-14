import { describe, expect, it } from "vitest";
import { buildCharacterCards } from "@/lib/character-cards";
import type { SrsCard, VocabItem } from "@/lib/types";

const userId = "11111111-1111-4111-8111-111111111111";

function vocab(overrides: Partial<VocabItem> = {}): VocabItem {
  return {
    id: "vocab-1",
    userId,
    hanzi: "茶",
    pinyin: "chá",
    english: "tea",
    tags: ["auto-generated"],
    sourceSessionId: "session-1",
    createdAt: "2026-07-14T10:00:00.000Z",
    ...overrides
  };
}

function srs(overrides: Partial<SrsCard> = {}): SrsCard {
  return {
    id: "srs-1",
    userId,
    prompt: "茶",
    answer: "chá — tea",
    hints: ["Recall context from your last session"],
    tags: ["auto-generated"],
    ease: 2.5,
    interval: 1,
    nextDueAt: "2026-07-14T10:00:00.000Z",
    ...overrides
  };
}

describe("character card normalization", () => {
  it("merges vocabulary and SRS data into one studied card", () => {
    const cards = buildCharacterCards([vocab()], [srs()]);

    expect(cards).toEqual([
      expect.objectContaining({
        id: "vocab-1",
        hanzi: "茶",
        pinyin: "chá",
        english: "tea",
        examples: ["茶"],
        learnedInSession: true,
        radical: undefined,
        mnemonic: undefined,
        commonWords: [],
        sources: ["vocabulary", "review"]
      })
    ]);
  });

  it("uses answer metadata for review-only cards and removes duplicates", () => {
    const cards = buildCharacterCards([], [
      srs({ id: "srs-1", prompt: "你好", answer: "nǐ hǎo — hello" }),
      srs({ id: "srs-2", prompt: " 你好 ", answer: "nǐ hǎo — hello", hints: [] })
    ]);

    expect(cards).toEqual([
      expect.objectContaining({
        id: "srs-1",
        hanzi: "你好",
        pinyin: "nǐ hǎo",
        english: "hello",
        examples: ["你好"],
        learnedInSession: false,
        sources: ["review"]
      })
    ]);
  });

  it("keeps partial character-bearing records and rejects non-Chinese content", () => {
    const cards = buildCharacterCards([
      vocab({ id: "partial", hanzi: "水", pinyin: undefined, english: undefined, sourceSessionId: undefined }),
      vocab({ id: "invalid", hanzi: "water", pinyin: "shuǐ", english: "water" })
    ], []);

    expect(cards).toEqual([
      expect.objectContaining({
        id: "partial",
        hanzi: "水",
        pinyin: undefined,
        english: undefined,
        examples: [],
        learnedInSession: false
      })
    ]);
  });
});
