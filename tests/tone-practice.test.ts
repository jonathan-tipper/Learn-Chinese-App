import { describe, expect, it } from "vitest";
import {
  TONE_PRACTICE_PROMPTS,
  buildTonePracticeAttempt,
  deriveWeakTonePairRollups,
  formatWeakTonePairLabel,
  getTonePracticePrompts,
  summarizeTonePracticeAttempts
} from "@/lib/tone-practice";

describe("tone practice catalog", () => {
  it("provides curated minimal-pair prompts with tone metadata and answer choices", () => {
    expect(TONE_PRACTICE_PROMPTS.length).toBeGreaterThanOrEqual(6);

    for (const prompt of TONE_PRACTICE_PROMPTS) {
      expect(prompt.id).toMatch(/^tone-/);
      expect(prompt.audioText).toBe(prompt.correctOption.hanzi);
      expect(prompt.toneContrast).toMatch(/^[1-4]\/[1-4]$/);
      expect(prompt.choices).toHaveLength(2);
      expect(prompt.choices.map((choice) => choice.id)).toContain(prompt.correctOption.id);
      expect(prompt.choices.every((choice) => choice.hanzi && choice.pinyin && choice.toneNumber && choice.gloss)).toBe(true);
      expect(prompt.hint).toContain("Tone");
    }
  });

  it("selects a stable short drill without mutating the catalog", () => {
    const selected = getTonePracticePrompts(4);

    expect(selected).toHaveLength(4);
    expect(selected.map((prompt) => prompt.id)).toEqual(TONE_PRACTICE_PROMPTS.slice(0, 4).map((prompt) => prompt.id));
    expect(selected).not.toBe(TONE_PRACTICE_PROMPTS);
  });
});

describe("tone practice attempts", () => {
  it("builds an attempt payload suitable for the evidence follow-up", () => {
    const prompt = TONE_PRACTICE_PROMPTS[0];
    const selected = prompt.choices.find((choice) => choice.id !== prompt.correctOption.id);
    expect(selected).toBeTruthy();

    const attempt = buildTonePracticeAttempt(prompt, selected!.id, "2026-07-05T20:00:00.000Z");

    expect(attempt).toEqual({
      promptId: prompt.id,
      toneContrast: prompt.toneContrast,
      selectedAnswer: selected!.id,
      correctAnswer: prompt.correctOption.id,
      result: "incorrect",
      timestamp: "2026-07-05T20:00:00.000Z"
    });
  });

  it("summarizes correct count and missed tone pairs conservatively", () => {
    const first = TONE_PRACTICE_PROMPTS[0];
    const second = TONE_PRACTICE_PROMPTS[1];
    const wrongFirst = first.choices.find((choice) => choice.id !== first.correctOption.id)!;

    const attempts = [
      buildTonePracticeAttempt(first, wrongFirst.id, "2026-07-05T20:00:00.000Z"),
      buildTonePracticeAttempt(second, second.correctOption.id, "2026-07-05T20:01:00.000Z")
    ];

    expect(summarizeTonePracticeAttempts(attempts)).toEqual({
      attemptedCount: 2,
      correctCount: 1,
      missedTonePairs: [first.toneContrast]
    });
  });

  it("derives recent weak tone-pair rollups without claiming pronunciation scoring", () => {
    const first = TONE_PRACTICE_PROMPTS[1];
    const second = TONE_PRACTICE_PROMPTS[2];
    const wrongFirst = first.choices.find((choice) => choice.id !== first.correctOption.id)!;
    const wrongSecond = second.choices.find((choice) => choice.id !== second.correctOption.id)!;

    const attempts = [
      buildTonePracticeAttempt(first, wrongFirst.id, "2026-07-05T20:00:00.000Z"),
      buildTonePracticeAttempt(first, first.correctOption.id, "2026-07-05T20:01:00.000Z"),
      buildTonePracticeAttempt(second, wrongSecond.id, "2026-07-05T20:02:00.000Z"),
      buildTonePracticeAttempt(first, wrongFirst.id, "2026-07-05T20:03:00.000Z")
    ];

    const rollups = deriveWeakTonePairRollups(attempts, { limit: 2 });

    expect(rollups).toEqual([
      {
        toneContrast: first.toneContrast,
        attemptedCount: 3,
        missedCount: 2,
        lastAttemptAt: "2026-07-05T20:03:00.000Z"
      },
      {
        toneContrast: second.toneContrast,
        attemptedCount: 1,
        missedCount: 1,
        lastAttemptAt: "2026-07-05T20:02:00.000Z"
      }
    ]);
    expect(rollups.map(formatWeakTonePairLabel)).toEqual([
      `tone pairs ${first.toneContrast} contrast`,
      `tone pairs ${second.toneContrast} contrast`
    ]);
  });
});
