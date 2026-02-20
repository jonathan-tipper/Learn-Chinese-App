"use client";

import { useMemo, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";

type Card = { id: string; prompt: string; answer: string; hints: string[] };
type SpeechRecognitionResultEventLike = {
  results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
};
type WebkitSpeechRecognitionLike = {
  lang: string;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  start: () => void;
};
type WebkitSpeechRecognitionConstructor = new () => WebkitSpeechRecognitionLike;

const characterQuestions = [
  { hanzi: "你", pinyin: "ni3", meaning: "you" },
  { hanzi: "好", pinyin: "hao3", meaning: "good" },
  { hanzi: "茶", pinyin: "cha2", meaning: "tea" }
];

export default function ReviewPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [status, setStatus] = useState("Load due cards to begin your 2-minute practice.");
  const [spokenText, setSpokenText] = useState("");
  const [characterInput, setCharacterInput] = useState("");
  const [characterIndex, setCharacterIndex] = useState(0);

  const currentCharacter = useMemo(() => characterQuestions[characterIndex % characterQuestions.length], [characterIndex]);

  async function loadDue() {
    const response = await authedFetch("/api/srs/next?limit=5");
    if (!response.ok) {
      setCards([]);
      setStatus("Please sign in to load review cards.");
      return;
    }
    const data = await response.json();
    setCards(data.cards ?? []);
  }

  async function grade(cardId: string, gradeValue: "again" | "hard" | "good" | "easy") {
    const response = await authedFetch("/api/srs/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, grade: gradeValue })
    });
    if (!response.ok) {
      setStatus("Please sign in to grade cards.");
      return;
    }
    const data = await response.json();
    setStatus(`Card graded ${gradeValue}. Next due: ${data.nextDueAt ?? "unknown"}`);
    loadDue();
  }

  function startSpeechInput() {
    const SpeechRecognition = (window as Window & { webkitSpeechRecognition?: WebkitSpeechRecognitionConstructor }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus("Speech input unavailable in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.onresult = (event: SpeechRecognitionResultEventLike) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      setSpokenText(transcript);
      setStatus(`Captured speech: ${transcript}`);
    };
    recognition.start();
  }

  function checkCharacterAnswer() {
    if (characterInput.trim().toLowerCase() === currentCharacter.pinyin) {
      setStatus(`Correct: ${currentCharacter.hanzi} = ${currentCharacter.pinyin}`);
      setCharacterIndex((prev) => prev + 1);
      setCharacterInput("");
      return;
    }

    setStatus(`Not quite. Hint: starts with '${currentCharacter.pinyin[0]}'.`);
  }

  return (
    <section>
      <h2>Quick Practice (2 min)</h2>
      <div className="card">
        <button type="button" onClick={loadDue}>Load 5 due cards</button>
        <p>{status}</p>
      </div>

      {cards.map((card) => (
        <div className="card" key={card.id}>
          <strong>{card.prompt}</strong>
          <p>Hint: {card.hints?.[0]}</p>
          <details><summary>Reveal answer</summary><p>{card.answer}</p></details>
          <div className="row">
            <button type="button" onClick={() => grade(card.id, "again")}>Again</button>
            <button type="button" onClick={() => grade(card.id, "hard")}>Hard</button>
            <button type="button" onClick={() => grade(card.id, "good")}>Good</button>
            <button type="button" onClick={() => grade(card.id, "easy")}>Easy</button>
          </div>
        </div>
      ))}

      <div className="card">
        <h3>Speaking prompt</h3>
        <p>Say: 我今天想点一杯茶。</p>
        <div className="row">
          <button type="button" onClick={startSpeechInput}>Start speech input</button>
          <button type="button" onClick={() => setSpokenText("")}>Clear speech</button>
        </div>
        <p>Captured: {spokenText || "(none)"}</p>
      </div>

      <div className="card">
        <h3>Character mini-practice</h3>
        <p>Type pinyin for: <strong>{currentCharacter.hanzi}</strong> ({currentCharacter.meaning})</p>
        <div className="row">
          <input value={characterInput} onChange={(e) => setCharacterInput(e.target.value)} placeholder="e.g. ni3" />
          <button type="button" onClick={checkCharacterAnswer}>Check</button>
        </div>
      </div>
    </section>
  );
}
