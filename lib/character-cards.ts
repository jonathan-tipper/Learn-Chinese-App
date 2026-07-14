import type { CharacterCard, SrsCard, VocabItem } from "@/lib/types";

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/;

function clean(value?: string) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function identity(hanzi: string) {
  return hanzi.trim().toLocaleLowerCase();
}

function parseReviewAnswer(answer: string) {
  const [rawPinyin, ...rawEnglish] = answer.split(/\s+[—–-]\s+/);
  if (rawEnglish.length === 0) {
    return { english: clean(answer) };
  }

  return {
    pinyin: clean(rawPinyin),
    english: clean(rawEnglish.join(" — "))
  };
}

function emptyCard(id: string, hanzi: string): CharacterCard {
  return {
    id,
    hanzi,
    examples: [],
    learnedInSession: false,
    radical: undefined,
    mnemonic: undefined,
    commonWords: [],
    sources: []
  };
}

export function buildCharacterCards(vocabItems: VocabItem[], srsCards: SrsCard[]): CharacterCard[] {
  const cards = new Map<string, CharacterCard>();

  for (const item of vocabItems) {
    const hanzi = clean(item.hanzi);
    if (!hanzi || !CJK_RE.test(hanzi)) continue;

    const key = identity(hanzi);
    const current = cards.get(key) ?? emptyCard(item.id, hanzi);
    cards.set(key, {
      ...current,
      pinyin: clean(item.pinyin) ?? current.pinyin,
      english: clean(item.english) ?? current.english,
      learnedInSession: current.learnedInSession || Boolean(item.sourceSessionId),
      sources: current.sources.includes("vocabulary")
        ? current.sources
        : [...current.sources, "vocabulary"]
    });
  }

  for (const item of srsCards) {
    const hanzi = clean(item.prompt);
    if (!hanzi || !CJK_RE.test(hanzi)) continue;

    const key = identity(hanzi);
    const current = cards.get(key) ?? emptyCard(item.id, hanzi);
    const answer = parseReviewAnswer(item.answer);
    cards.set(key, {
      ...current,
      pinyin: current.pinyin ?? answer.pinyin,
      english: current.english ?? answer.english,
      examples: current.examples.includes(hanzi)
        ? current.examples
        : [...current.examples, hanzi],
      sources: current.sources.includes("review")
        ? current.sources
        : [...current.sources, "review"]
    });
  }

  return Array.from(cards.values());
}
