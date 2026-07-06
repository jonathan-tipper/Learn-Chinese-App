export type ToneNumber = 1 | 2 | 3 | 4;

export type TonePracticeChoice = {
  id: string;
  hanzi: string;
  pinyin: string;
  toneNumber: ToneNumber;
  gloss: string;
};

export type TonePracticePrompt = {
  id: string;
  toneContrast: `${ToneNumber}/${ToneNumber}`;
  audioText: string;
  correctOption: TonePracticeChoice;
  choices: [TonePracticeChoice, TonePracticeChoice];
  hint: string;
  explanation: string;
};

export type TonePracticeAttempt = {
  promptId: string;
  toneContrast: TonePracticePrompt["toneContrast"];
  selectedAnswer: string;
  correctAnswer: string;
  result: "correct" | "incorrect";
  timestamp: string;
};

export const TONE_PRACTICE_PROMPTS: TonePracticePrompt[] = [
  {
    id: "tone-ma-1-3",
    toneContrast: "1/3",
    audioText: "妈",
    correctOption: { id: "ma1-mother", hanzi: "妈", pinyin: "mā", toneNumber: 1, gloss: "mother" },
    choices: [
      { id: "ma1-mother", hanzi: "妈", pinyin: "mā", toneNumber: 1, gloss: "mother" },
      { id: "ma3-horse", hanzi: "马", pinyin: "mǎ", toneNumber: 3, gloss: "horse" }
    ],
    hint: "Tone 1 stays high and level; Tone 3 dips low before rising.",
    explanation: "The audio is mā: a steady high tone, not the dipping third tone mǎ."
  },
  {
    id: "tone-ma-2-4",
    toneContrast: "2/4",
    audioText: "骂",
    correctOption: { id: "ma4-scold", hanzi: "骂", pinyin: "mà", toneNumber: 4, gloss: "scold" },
    choices: [
      { id: "ma2-hemp", hanzi: "麻", pinyin: "má", toneNumber: 2, gloss: "hemp / numb" },
      { id: "ma4-scold", hanzi: "骂", pinyin: "mà", toneNumber: 4, gloss: "scold" }
    ],
    hint: "Tone 2 rises like a question; Tone 4 drops sharply.",
    explanation: "The audio is mà: a short falling tone, not the rising second tone má."
  },
  {
    id: "tone-mai-3-4",
    toneContrast: "3/4",
    audioText: "买",
    correctOption: { id: "mai3-buy", hanzi: "买", pinyin: "mǎi", toneNumber: 3, gloss: "buy" },
    choices: [
      { id: "mai3-buy", hanzi: "买", pinyin: "mǎi", toneNumber: 3, gloss: "buy" },
      { id: "mai4-sell", hanzi: "卖", pinyin: "mài", toneNumber: 4, gloss: "sell" }
    ],
    hint: "Tone 3 has a low dip; Tone 4 falls quickly from high to low.",
    explanation: "The audio is mǎi: listen for the low dipping contour before the vowel finishes."
  },
  {
    id: "tone-tang-1-2",
    toneContrast: "1/2",
    audioText: "糖",
    correctOption: { id: "tang2-sugar", hanzi: "糖", pinyin: "táng", toneNumber: 2, gloss: "sugar" },
    choices: [
      { id: "tang1-soup", hanzi: "汤", pinyin: "tāng", toneNumber: 1, gloss: "soup" },
      { id: "tang2-sugar", hanzi: "糖", pinyin: "táng", toneNumber: 2, gloss: "sugar" }
    ],
    hint: "Tone 1 is flat and high; Tone 2 rises upward.",
    explanation: "The audio is táng: a rising second tone, not the flat first tone tāng."
  },
  {
    id: "tone-shi-2-4",
    toneContrast: "2/4",
    audioText: "十",
    correctOption: { id: "shi2-ten", hanzi: "十", pinyin: "shí", toneNumber: 2, gloss: "ten" },
    choices: [
      { id: "shi2-ten", hanzi: "十", pinyin: "shí", toneNumber: 2, gloss: "ten" },
      { id: "shi4-is", hanzi: "是", pinyin: "shì", toneNumber: 4, gloss: "to be" }
    ],
    hint: "Tone 2 climbs; Tone 4 falls with a clipped finish.",
    explanation: "The audio is shí: a rising tone, not the falling shì."
  },
  {
    id: "tone-hua-1-4",
    toneContrast: "1/4",
    audioText: "话",
    correctOption: { id: "hua4-speech", hanzi: "话", pinyin: "huà", toneNumber: 4, gloss: "speech" },
    choices: [
      { id: "hua1-flower", hanzi: "花", pinyin: "huā", toneNumber: 1, gloss: "flower" },
      { id: "hua4-speech", hanzi: "话", pinyin: "huà", toneNumber: 4, gloss: "speech" }
    ],
    hint: "Tone 1 holds steady; Tone 4 drops decisively.",
    explanation: "The audio is huà: a falling fourth tone, not the steady high huā."
  },
  {
    id: "tone-zhi-1-3",
    toneContrast: "1/3",
    audioText: "纸",
    correctOption: { id: "zhi3-paper", hanzi: "纸", pinyin: "zhǐ", toneNumber: 3, gloss: "paper" },
    choices: [
      { id: "zhi1-know", hanzi: "知", pinyin: "zhī", toneNumber: 1, gloss: "know" },
      { id: "zhi3-paper", hanzi: "纸", pinyin: "zhǐ", toneNumber: 3, gloss: "paper" }
    ],
    hint: "Tone 3 should feel lower and more curved than Tone 1.",
    explanation: "The audio is zhǐ: a third tone with a low dip."
  },
  {
    id: "tone-ge-1-4",
    toneContrast: "1/4",
    audioText: "个",
    correctOption: { id: "ge4-measure", hanzi: "个", pinyin: "gè", toneNumber: 4, gloss: "measure word" },
    choices: [
      { id: "ge1-older-brother", hanzi: "哥", pinyin: "gē", toneNumber: 1, gloss: "older brother" },
      { id: "ge4-measure", hanzi: "个", pinyin: "gè", toneNumber: 4, gloss: "measure word" }
    ],
    hint: "Tone 4 has a strong falling contour.",
    explanation: "The audio is gè: a falling fourth tone, not the steady gē."
  }
];

export function getTonePracticePrompts(limit = 6): TonePracticePrompt[] {
  return TONE_PRACTICE_PROMPTS.slice(0, limit);
}

export function buildTonePracticeAttempt(
  prompt: TonePracticePrompt,
  selectedAnswer: string,
  timestamp = new Date().toISOString()
): TonePracticeAttempt {
  return {
    promptId: prompt.id,
    toneContrast: prompt.toneContrast,
    selectedAnswer,
    correctAnswer: prompt.correctOption.id,
    result: selectedAnswer === prompt.correctOption.id ? "correct" : "incorrect",
    timestamp
  };
}

export function summarizeTonePracticeAttempts(attempts: TonePracticeAttempt[]) {
  const missedTonePairs = Array.from(
    new Set(
      attempts
        .filter((attempt) => attempt.result === "incorrect")
        .map((attempt) => attempt.toneContrast)
    )
  );

  return {
    attemptedCount: attempts.length,
    correctCount: attempts.filter((attempt) => attempt.result === "correct").length,
    missedTonePairs
  };
}
