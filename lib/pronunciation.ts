import { formatWeakTonePairLabel } from "@/lib/tone-practice";

/**
 * Client-safe pronunciation types and evidence math. The scorer itself lives in
 * server/agents/pronunciationCoach.ts because it depends on a large pinyin dictionary.
 */

export type SyllableStatus = "match" | "tone" | "sound" | "missing" | "extra";

export interface Syllable {
  hanzi: string;
  /** Pinyin with tone marks, e.g. "chá". */
  pinyin: string;
  /** Toneless pinyin base, e.g. "cha". */
  base: string;
  initial: string;
  final: string;
  /** 1-4, 0 for neutral. */
  tone: number;
}

export interface SyllableResult {
  status: SyllableStatus;
  target?: Syllable;
  heard?: Syllable;
  note?: string;
}

export interface PronunciationScore {
  /** 0-100. */
  score: number;
  verdict: "great" | "close" | "retry";
  results: SyllableResult[];
  tips: string[];
  /** Tone contrasts missed, formatted like the tone drill ("2/4"). */
  toneContrastsMissed: string[];
  /** Sound confusions, formatted "expected→heard" (e.g. "zh→z"). */
  soundsMissed: string[];
  targetText: string;
  heardText: string;
  /** Present when the attempt was recorded against a session. */
  weakAreas?: string[];
}

export interface SpeakingPrompt {
  hanzi: string;
  pinyin: string;
  english: string;
  source: "plan" | "vocab" | "fallback";
}

export interface PronunciationAttempt {
  sessionId?: string;
  target: string;
  transcript: string;
  score: number;
  toneContrastsMissed: string[];
  soundsMissed: string[];
  timestamp: string;
}

export function formatToneContrast(expected: number, heard: number) {
  const a = Math.max(1, Math.min(4, expected || 1));
  const b = Math.max(1, Math.min(4, heard || 1));
  return `${Math.min(a, b)}/${Math.max(a, b)}` as `${1 | 2 | 3 | 4}/${1 | 2 | 3 | 4}`;
}

export function normalizePronunciationAttempt(attempt: PronunciationAttempt, sessionId?: string): PronunciationAttempt {
  if (!attempt.target.trim()) throw new Error("Pronunciation attempt needs a target phrase");
  if (Number.isNaN(Date.parse(attempt.timestamp))) throw new Error("Invalid pronunciation attempt timestamp");
  return {
    sessionId: sessionId ?? attempt.sessionId,
    target: attempt.target.trim().slice(0, 80),
    transcript: attempt.transcript.trim().slice(0, 200),
    score: Math.max(0, Math.min(100, Math.round(attempt.score))),
    toneContrastsMissed: attempt.toneContrastsMissed.filter((value) => /^[1-4]\/[1-4]$/.test(value)).slice(0, 12),
    soundsMissed: attempt.soundsMissed.filter((value) => /^[a-zü]{1,5}→[a-zü]{1,5}$/.test(value)).slice(0, 12),
    timestamp: new Date(attempt.timestamp).toISOString()
  };
}

/**
 * Weak-area labels from speaking attempts. A problem must show up at least twice to count,
 * so one noisy recording does not label the learner.
 */
export function deriveWeakPronunciationAreas(attempts: PronunciationAttempt[], options: { limit?: number; minCount?: number } = {}) {
  const minCount = options.minCount ?? 2;
  const toneCounts = new Map<string, number>();
  const soundCounts = new Map<string, number>();

  for (const attempt of attempts) {
    for (const contrast of attempt.toneContrastsMissed) toneCounts.set(contrast, (toneCounts.get(contrast) ?? 0) + 1);
    for (const sound of attempt.soundsMissed) soundCounts.set(sound, (soundCounts.get(sound) ?? 0) + 1);
  }

  const ranked = [
    ...Array.from(toneCounts.entries()).map(([contrast, count]) => ({
      label: formatWeakTonePairLabel({ toneContrast: contrast as `${1 | 2 | 3 | 4}/${1 | 2 | 3 | 4}` }),
      count
    })),
    ...Array.from(soundCounts.entries()).map(([sound, count]) => {
      const [expected, heard] = sound.split("→");
      return { label: `sound ${expected} vs ${heard}`, count };
    })
  ]
    .filter((item) => item.count >= minCount)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return ranked.slice(0, options.limit ?? 4).map((item) => item.label);
}
