import { pinyin } from "pinyin-pro";
import {
  type PronunciationScore,
  type Syllable,
  type SyllableResult,
  formatToneContrast
} from "@/lib/pronunciation";

/**
 * Pronunciation Coach: compares what the browser's speech recogniser heard against the
 * target sentence at syllable level. ASR returns characters, not audio features, so this is
 * a lightweight heuristic: a homophone with the wrong tone (买 vs 卖) reveals a tone slip,
 * a different initial (z vs zh) reveals a sound slip. Good enough to steer practice; it does
 * not claim phonetic scoring.
 */

const CJK_ONLY = /[^一-鿿㐀-䶿]/gu;

const TONE_DESCRIPTIONS: Record<number, string> = {
  1: "high and level, like holding a note",
  2: "rising, like asking a question",
  3: "dips low and then rises",
  4: "falls sharply from high to low",
  0: "light and short (neutral)"
};

/** Confusions English speakers make most; keys are "expected→heard". */
const SOUND_TIPS: Record<string, string> = {
  "zh→z": "zh is retroflex: curl the tongue tip back toward the roof of the mouth; z is flat, tongue behind the teeth.",
  "z→zh": "z is flat with the tongue tip behind the teeth; do not curl it back as for zh.",
  "ch→c": "ch curls the tongue tip back; c is flat like the 'ts' in 'cats'.",
  "c→ch": "c is a flat 'ts'; keep the tongue tip forward instead of curling it.",
  "sh→s": "sh curls the tongue back; s is a plain hiss with the tongue forward.",
  "s→sh": "s is a plain forward hiss; do not curl the tongue back.",
  "sh→x": "sh is retroflex; x is made with the tongue flat and the sides high, like 'sh' with a smile.",
  "x→sh": "x is a smiling, flat-tongued sound; sh curls the tongue back.",
  "q→ch": "q is like 'ch' but with the tongue flat and spread, lips smiling.",
  "ch→q": "ch curls the tongue back; q keeps it flat behind the lower teeth.",
  "j→zh": "j keeps the tongue flat behind the lower teeth; zh curls it back.",
  "zh→j": "zh curls the tongue tip back; j stays flat and forward.",
  "r→l": "Mandarin r is a soft buzzing sound with the tongue curled back, no tongue tip contact.",
  "l→r": "l touches the tongue tip to the ridge behind the teeth; r never touches.",
  "n→l": "n releases air through the nose; l lets air pass around the sides of the tongue.",
  "l→n": "l lets air pass around the tongue; n sends it through the nose.",
  "ü→u": "ü is 'ee' with rounded lips; u is a plain 'oo'.",
  "u→ü": "u is a plain 'oo'; do not spread the tongue as for ü.",
  "an→ang": "-an ends with the tongue tip touching behind the teeth; -ang ends open at the back.",
  "ang→an": "-ang keeps the mouth open with the sound at the back; -an closes with the tongue tip.",
  "en→eng": "-en ends with the tongue tip forward; -eng ends at the back of the mouth.",
  "eng→en": "-eng ends at the back; -en closes with the tongue tip forward.",
  "in→ing": "-in ends forward; -ing ends at the back like English 'sing'.",
  "ing→in": "-ing ends at the back; -in closes with the tongue tip forward."
};

function stripTone(value: string) {
  return value.replace(/[0-9]/g, "");
}

export function syllabify(text: string): Syllable[] {
  const cjk = text.normalize("NFKC").replace(CJK_ONLY, "");
  if (!cjk) return [];
  const withNumbers = pinyin(cjk, { type: "all", toneType: "num" });
  const withMarks = pinyin(cjk, { type: "array" });

  return withNumbers.map((item, index) => ({
    hanzi: item.origin,
    pinyin: withMarks[index] ?? stripTone(item.pinyin),
    base: stripTone(item.pinyin),
    initial: item.initial ?? "",
    final: stripTone(item.final ?? ""),
    tone: typeof item.num === "number" ? item.num : Number(String(item.num ?? 0))
  }));
}

function substitutionCost(a: Syllable, b: Syllable) {
  if (a.base === b.base && a.tone === b.tone) return 0;
  if (a.base === b.base) return 0.4;
  if (a.initial === b.initial || a.final === b.final) return 0.75;
  return 1;
}

/** Needleman-Wunsch style alignment of target vs heard syllables. */
export function alignSyllables(target: Syllable[], heard: Syllable[]): SyllableResult[] {
  const rows = target.length + 1;
  const cols = heard.length + 1;
  const cost: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 1; i < rows; i++) cost[i][0] = i;
  for (let j = 1; j < cols; j++) cost[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      cost[i][j] = Math.min(
        cost[i - 1][j - 1] + substitutionCost(target[i - 1], heard[j - 1]),
        cost[i - 1][j] + 1,
        cost[i][j - 1] + 1
      );
    }
  }

  const results: SyllableResult[] = [];
  let i = target.length;
  let j = heard.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const diagonal = cost[i - 1][j - 1] + substitutionCost(target[i - 1], heard[j - 1]);
      if (Math.abs(cost[i][j] - diagonal) < 1e-9) {
        const t = target[i - 1];
        const h = heard[j - 1];
        const status = t.base === h.base && t.tone === h.tone
          ? "match"
          : t.base === h.base
            ? "tone"
            : "sound";
        results.push({ status, target: t, heard: h });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && (j === 0 || Math.abs(cost[i][j] - (cost[i - 1][j] + 1)) < 1e-9)) {
      results.push({ status: "missing", target: target[i - 1] });
      i--;
      continue;
    }
    results.push({ status: "extra", heard: heard[j - 1] });
    j--;
  }

  return results.reverse();
}

function soundKey(target: Syllable, heard: Syllable) {
  if (target.initial !== heard.initial && target.initial && heard.initial) return `${target.initial}→${heard.initial}`;
  if (target.final !== heard.final) return `${target.final}→${heard.final}`;
  if (target.initial !== heard.initial) return `${target.initial || "∅"}→${heard.initial || "∅"}`;
  return null;
}

export function scorePronunciation(targetText: string, heardText: string): PronunciationScore {
  const target = syllabify(targetText);
  const heard = syllabify(heardText);
  const results = alignSyllables(target, heard);

  const tips: string[] = [];
  const toneContrastsMissed: string[] = [];
  const soundsMissed: string[] = [];
  let points = 0;

  for (const result of results) {
    const t = result.target;
    const h = result.heard;
    switch (result.status) {
      case "match":
        points += 1;
        break;
      case "tone": {
        points += 0.5;
        if (t && h) {
          toneContrastsMissed.push(formatToneContrast(t.tone, h.tone));
          result.note = `Tone ${t.tone || "neutral"}: ${TONE_DESCRIPTIONS[t.tone] ?? ""}`;
          tips.push(`${t.hanzi} (${t.pinyin}) is tone ${t.tone || "neutral"}: ${TONE_DESCRIPTIONS[t.tone] ?? ""}. It sounded like ${h.hanzi} (${h.pinyin}), tone ${h.tone || "neutral"}.`);
        }
        break;
      }
      case "sound": {
        if (t && h) {
          const partial = t.initial === h.initial || t.final === h.final;
          points += partial ? 0.25 : 0;
          const key = soundKey(t, h);
          if (key) {
            soundsMissed.push(key.replace(/∅/g, ""));
            const specific = SOUND_TIPS[key];
            result.note = specific ?? `Expected ${t.pinyin}, heard ${h.pinyin}`;
            tips.push(
              specific
                ? `${t.hanzi} (${t.pinyin}) sounded like ${h.hanzi} (${h.pinyin}). ${specific}`
                : `${t.hanzi} should sound like ${t.pinyin}, but it came through as ${h.hanzi} (${h.pinyin}).`
            );
          }
        }
        break;
      }
      case "missing":
        if (t) {
          result.note = "Not heard";
          tips.push(`${t.hanzi} (${t.pinyin}) was not heard. Give each syllable its full length.`);
        }
        break;
      case "extra":
        break;
    }
  }

  const score = target.length ? Math.round((points / target.length) * 100) : 0;
  const verdict = score >= 90 ? "great" : score >= 65 ? "close" : "retry";
  const extras = results.filter((result) => result.status === "extra").length;
  if (extras > 0 && tips.length < 4) {
    tips.push(extras === 1 ? "One extra syllable was heard; keep the phrase tight." : `${extras} extra syllables were heard; keep the phrase tight.`);
  }

  return {
    score,
    verdict,
    results,
    tips: tips.slice(0, 4),
    toneContrastsMissed: Array.from(new Set(toneContrastsMissed)),
    soundsMissed: Array.from(new Set(soundsMissed.filter((sound) => /^[a-zü]{1,5}→[a-zü]{1,5}$/.test(sound)))),
    targetText: target.map((syllable) => syllable.hanzi).join(""),
    heardText: heard.map((syllable) => syllable.hanzi).join("")
  };
}
