import { describe, expect, it } from "vitest";
import { deriveWeakPronunciationAreas, formatToneContrast, normalizePronunciationAttempt } from "@/lib/pronunciation";
import { alignSyllables, scorePronunciation, syllabify } from "@/server/agents/pronunciationCoach";

describe("pronunciation coach", () => {
  it("syllabifies with initials, finals and tone numbers", () => {
    const syllables = syllabify("该洗澡了");
    expect(syllables.map((s) => [s.hanzi, s.base, s.tone])).toEqual([["该", "gai", 1], ["洗", "xi", 3], ["澡", "zao", 3], ["了", "le", 0]]);
    expect(syllables[1].initial).toBe("x");
    expect(syllables[1].final).toBe("i");
    expect(syllables[0].pinyin).toBe("gāi");
  });

  it("scores an exact match as great", () => {
    const result = scorePronunciation("我今天想点一杯茶。", "我今天想点一杯茶");
    expect(result.score).toBe(100);
    expect(result.verdict).toBe("great");
    expect(result.results.every((r) => r.status === "match")).toBe(true);
    expect(result.tips).toEqual([]);
  });

  it("detects a tone slip through a homophone", () => {
    const result = scorePronunciation("我想买茶", "我想卖茶");
    const slip = result.results.find((r) => r.status === "tone");
    expect(slip?.target?.hanzi).toBe("买");
    expect(slip?.heard?.hanzi).toBe("卖");
    expect(result.toneContrastsMissed).toEqual(["3/4"]);
    expect(result.tips[0]).toContain("买 (mǎi) is tone 3");
    expect(result.score).toBe(88);
    expect(result.verdict).toBe("close");
  });

  it("detects a sound confusion and gives the retroflex tip", () => {
    const result = scorePronunciation("这是茶", "这是擦");
    const slip = result.results.find((r) => r.status === "sound");
    expect(slip?.target?.hanzi).toBe("茶");
    expect(result.soundsMissed).toEqual(["ch→c"]);
    expect(result.tips[0]).toContain("curls the tongue tip back");
  });

  it("marks missing and extra syllables", () => {
    const result = scorePronunciation("请给我一杯茶", "请给我茶");
    expect(result.results.filter((r) => r.status === "missing").map((r) => r.target?.hanzi)).toEqual(["一", "杯"]);
    expect(result.verdict).toBe("close");

    const extra = scorePronunciation("你好", "你好吗");
    expect(extra.results.filter((r) => r.status === "extra")).toHaveLength(1);
    expect(extra.score).toBe(100);
  });

  it("handles empty transcripts and non-Chinese input", () => {
    const result = scorePronunciation("你好", "");
    expect(result.score).toBe(0);
    expect(result.verdict).toBe("retry");
    expect(scorePronunciation("hello", "hello").targetText).toBe("");
    expect(alignSyllables([], [])).toEqual([]);
  });

  it("derives weak areas only from repeated slips", () => {
    const attempt = (toneContrastsMissed: string[], soundsMissed: string[]) => normalizePronunciationAttempt({
      target: "买", transcript: "卖", score: 50, toneContrastsMissed, soundsMissed, timestamp: "2026-09-11T10:00:00.000Z"
    });
    expect(deriveWeakPronunciationAreas([attempt(["3/4"], ["zh→z"])])).toEqual([]);
    expect(deriveWeakPronunciationAreas([attempt(["3/4"], ["zh→z"]), attempt(["3/4"], [])]))
      .toEqual(["tone pairs 3/4 contrast"]);
    expect(deriveWeakPronunciationAreas([attempt([], ["zh→z"]), attempt([], ["zh→z"])], { minCount: 2 }))
      .toEqual(["sound zh vs z"]);
    expect(formatToneContrast(4, 2)).toBe("2/4");
  });
});
