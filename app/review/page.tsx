"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Mic,
  RefreshCw,
  RotateCcw,
  Volume2,
  XCircle
} from "lucide-react";
import { authedFetch } from "@/lib/authed-fetch";
import { drainQueue, enqueueGrade } from "@/lib/srs-queue";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type Card = { id: string; prompt: string; answer: string; hints: string[] };

type SpeechRecognitionResultEventLike = {
  results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
};
type WebkitSpeechRecognitionLike = {
  lang: string;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
};
type WebkitSpeechRecognitionConstructor = new () => WebkitSpeechRecognitionLike;

const characterQuestions = [
  { hanzi: "你", pinyin: "ni3", meaning: "you" },
  { hanzi: "好", pinyin: "hao3", meaning: "good" },
  { hanzi: "茶", pinyin: "cha2", meaning: "tea" },
  { hanzi: "水", pinyin: "shui3", meaning: "water" },
  { hanzi: "谢", pinyin: "xie4", meaning: "thank" }
];

const GRADE_CONFIG = {
  again: { label: "Again", shortcut: "1", variant: "outline" as const, color: "text-destructive border-destructive/50 hover:bg-destructive/10" },
  hard:  { label: "Hard",  shortcut: "2", variant: "outline" as const, color: "text-orange-600 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:hover:bg-orange-950/30" },
  good:  { label: "Good",  shortcut: "3", variant: "outline" as const, color: "text-jade border-jade/50 hover:bg-jade/10" },
  easy:  { label: "Easy",  shortcut: "4", variant: "outline" as const, color: "text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950/30" }
} as const;

type Grade = keyof typeof GRADE_CONFIG;

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const LEGACY_PREFIX_RE = /^Translate or use:\s*/i;

/** Strip legacy prefix and embedded English/pinyin, leaving only the Chinese/hanzi for the prompt. */
function cleanPromptForDisplay(prompt: string): string {
  const cleaned = prompt.replace(LEGACY_PREFIX_RE, "");
  // "请 (qǐng) - please" → "请"
  const dashMatch = cleaned.match(/^(.+?)\s*(?:\([^)]+\))?\s*[-—–]\s*.+$/);
  if (dashMatch && CJK_RE.test(dashMatch[1])) {
    return dashMatch[1].trim();
  }
  // "请 (please)" — no dash, trailing parens
  const parenMatch = cleaned.match(/^(.+?)\s*\([^)]+\)\s*$/);
  if (parenMatch && CJK_RE.test(parenMatch[1])) {
    return parenMatch[1].trim();
  }
  return cleaned;
}

/**
 * Clean the answer for display in the reveal panel.
 * For legacy cards where answer equals the full "Chinese (pinyin) - English" string,
 * extract just the pinyin + English part so the Chinese is not repeated in the reveal.
 */
function cleanAnswerForDisplay(answer: string, prompt: string): string {
  const strippedPrompt = cleanPromptForDisplay(prompt);
  // If answer starts with the same Chinese as the prompt, strip it
  if (strippedPrompt && answer.startsWith(strippedPrompt)) {
    const remainder = answer.slice(strippedPrompt.length).replace(/^\s*[\u2014\-—–(]\s*/, "").trim();
    if (remainder) return remainder;
  }
  // "Chinese (pinyin) - English" stored as answer → extract "pinyin - English"
  const fullMatch = answer.match(/^.+?\s*\(([^)]+)\)\s*[-—–]\s*(.+)$/);
  if (fullMatch && CJK_RE.test(answer.slice(0, 2))) {
    return `${fullMatch[1]} — ${fullMatch[2]}`;
  }
  return answer;
}

/** True when prompt and answer carry the same information (malformed/legacy card). */
function isMalformedCard(prompt: string, answer: string): boolean {
  const cleanedPrompt = cleanPromptForDisplay(prompt);
  const cleanedAnswer = cleanAnswerForDisplay(answer, prompt);
  // Both sides are identical, or the answer is purely CJK (no English revealed)
  return cleanedPrompt === cleanedAnswer || (CJK_RE.test(cleanedAnswer) && !/[a-zA-Z]/.test(cleanedAnswer));
}

export default function ReviewPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalLoaded, setTotalLoaded] = useState(0);
  const [revealedCards, setRevealedCards] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message: string }>({
    type: "idle",
    message: "Load your due cards to begin a 2-minute practice session."
  });
  const [isLoading, setIsLoading] = useState(false);
  const [spokenText, setSpokenText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [characterInput, setCharacterInput] = useState("");
  const [characterIndex, setCharacterIndex] = useState(0);
  const [charFeedback, setCharFeedback] = useState<"correct" | "wrong" | null>(null);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  async function playTts(cardId: string, text: string) {
    // Stop any currently playing audio
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current = null;
    }
    setTtsLoadingId(cardId);
    try {
      const response = await authedFetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, speed: 0.85 })
      });
      if (!response.ok) throw new Error("TTS request failed");
      const data = await response.json();
      const audio = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
      ttsAudioRef.current = audio;
      await audio.play();
    } catch {
      setStatus({ type: "error", message: "Could not play audio." });
    } finally {
      setTtsLoadingId(null);
    }
  }

  const currentCharacter = useMemo(
    () => characterQuestions[characterIndex % characterQuestions.length],
    [characterIndex]
  );

  const progressPct = totalLoaded > 0 ? (completedCount / totalLoaded) * 100 : 0;

  // Drain any queued grades the moment the browser comes back online
  useEffect(() => {
    async function handleOnline() {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const sent = await drainQueue(session.access_token);
      if (sent > 0) {
        setStatus({ type: "success", message: `Synced ${sent} offline grade${sent > 1 ? "s" : ""}.` });
      }
    }
    window.addEventListener("online", handleOnline);
    // Also drain immediately in case we loaded the page with queued grades and are now online
    if (navigator.onLine) void handleOnline();
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  async function loadDue() {
    setIsLoading(true);
    const response = await authedFetch("/api/srs/next?limit=5");
    setIsLoading(false);

    if (!response.ok) {
      setCards([]);
      setRevealedCards(new Set());
      setStatus({ type: "error", message: "Please sign in to load review cards." });
      return;
    }
    const data = await response.json();
    const loaded: Card[] = data.cards ?? [];
    setCards(loaded);
    setTotalLoaded(loaded.length);
    setCompletedCount(0);
    setRevealedCards(new Set());
    setStatus({
      type: "success",
      message: loaded.length > 0 ? `${loaded.length} cards loaded.` : "No due cards right now — you're caught up! 🎉"
    });
  }

  const grade = useCallback(async (cardId: string, gradeValue: Grade) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const currentCard = card;

    // Optimistically remove the card and bump the counter regardless of outcome
    setCompletedCount((c) => c + 1);
    setCards((prev) => prev.filter((c) => c.id !== cardId));

    function restoreCard(message: string) {
      setCompletedCount((c) => Math.max(0, c - 1));
      setCards((prev) => prev.some((c) => c.id === cardId) ? prev : [currentCard, ...prev]);
      setStatus({ type: "error", message });
    }

    try {
      const response = await authedFetch("/api/srs/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, grade: gradeValue })
      });

      if (!response.ok) {
        restoreCard("Could not grade this card. Please sign in and try again.");
        return;
      }

      const data = await response.json();
      const next = data.nextDueAt ? new Date(data.nextDueAt).toLocaleDateString() : "soon";
      setStatus({ type: "success", message: `Graded "${gradeValue}" — next review: ${next}` });
    } catch {
      // Network error — queue for later replay
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        await enqueueGrade({ cardId, grade: gradeValue });
        setStatus({ type: "idle", message: "You're offline — grade saved and will sync when this device is online." });
        return;
      }

      restoreCard("You're offline. Sign in before grading so this review can sync.");
    }
  }, [cards]);

  useEffect(() => {
    function handleGradeShortcut(event: KeyboardEvent) {
      const firstCard = cards[0];
      if (!firstCard || !revealedCards.has(firstCard.id)) return;

      const shortcutToGrade: Record<string, Grade> = {
        "1": "again",
        "2": "hard",
        "3": "good",
        "4": "easy"
      };
      const nextGrade = shortcutToGrade[event.key];
      if (!nextGrade) return;

      event.preventDefault();
      void grade(firstCard.id, nextGrade);
    }

    window.addEventListener("keydown", handleGradeShortcut);
    return () => window.removeEventListener("keydown", handleGradeShortcut);
  }, [cards, grade, revealedCards]);

  function toggleReveal(cardId: string) {
    setRevealedCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function startSpeechInput() {
    const SpeechRecognition = (window as Window & { webkitSpeechRecognition?: WebkitSpeechRecognitionConstructor }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus({ type: "error", message: "Speech input unavailable in this browser." });
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      setSpokenText(transcript);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
    setSpokenText("");
  }

  function checkCharacterAnswer() {
    if (characterInput.trim().toLowerCase() === currentCharacter.pinyin) {
      setCharFeedback("correct");
      setTimeout(() => {
        setCharacterIndex((prev) => prev + 1);
        setCharacterInput("");
        setCharFeedback(null);
      }, 600);
    } else {
      setCharFeedback("wrong");
      setTimeout(() => setCharFeedback(null), 1000);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Quick Practice</h1>
        <p className="text-sm text-muted-foreground">
          2-minute spaced repetition — review what&apos;s due today.
        </p>
      </div>

      {/* Load + progress */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              {totalLoaded > 0 ? (
                <span className="text-sm font-medium">
                  {completedCount} / {totalLoaded} reviewed
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">No cards loaded</span>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={loadDue} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {totalLoaded > 0 ? "Reload" : "Load due cards"}
            </Button>
          </div>

          {totalLoaded > 0 && (
            <Progress value={progressPct} className="h-1.5" />
          )}

          {status.message && (
            <div className={cn(
              "flex items-center gap-2 text-xs rounded-md px-3 py-2",
              status.type === "error" ? "bg-destructive/10 text-destructive" :
              status.type === "success" ? "bg-jade/10 text-jade" :
              "bg-muted text-muted-foreground"
            )}>
              {status.type === "error" && <XCircle className="h-3.5 w-3.5 shrink-0" />}
              {status.type === "success" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
              {status.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flashcards */}
      {cards.length > 0 && (
        <div className="space-y-3">
          {cards.map((card) => {
            const revealed = revealedCards.has(card.id);
            const displayPrompt = cleanPromptForDisplay(card.prompt);
            const displayAnswer = cleanAnswerForDisplay(card.answer, card.prompt);
            const malformed = isMalformedCard(card.prompt, card.answer);
            return (
              <Card
                key={card.id}
                className={cn(
                  "transition-all duration-200",
                  revealed && "border-foreground/20"
                )}
              >
                <CardContent className="p-5 space-y-4">
                  {/* Prompt — Chinese only, no spoilers */}
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Translate</p>
                      <p className="hanzi text-2xl font-semibold leading-tight">{displayPrompt}</p>
                    </div>
                    {card.hints?.[0] && (
                      <p className="text-xs text-muted-foreground">
                        Hint: {card.hints[0]}
                      </p>
                    )}
                  </div>

                  {/* Reveal */}
                  <button
                    type="button"
                    onClick={() => toggleReveal(card.id)}
                    className={cn(
                      "w-full rounded-lg border-2 border-dashed px-4 py-3 text-sm font-medium transition-all",
                      revealed
                        ? "border-foreground/20 bg-foreground/5 text-foreground animate-flip-in"
                        : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                    )}
                  >
                    {revealed ? (
                      <div className="flex items-center justify-between gap-2">
                        {malformed ? (
                          <span className="text-xs text-muted-foreground italic">
                            Card data incomplete — grade and a fresh card will replace it.
                          </span>
                        ) : (
                          <span className="text-base font-semibold">{displayAnswer}</span>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            void playTts(card.id, displayPrompt);
                          }}
                          disabled={ttsLoadingId === card.id}
                        >
                          {ttsLoadingId === card.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Volume2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <ChevronRight className="h-4 w-4" />
                        Tap to reveal answer
                      </span>
                    )}
                  </button>

                  {/* Grade buttons — only show after reveal */}
                  {revealed && (
                    <div className="grid grid-cols-4 gap-2 animate-fade-in">
                      {(Object.entries(GRADE_CONFIG) as [Grade, typeof GRADE_CONFIG[Grade]][]).map(([gradeKey, cfg]) => (
                        <button
                          key={gradeKey}
                          type="button"
                          onClick={() => void grade(card.id, gradeKey)}
                          className={cn(
                            "flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors",
                            cfg.color
                          )}
                        >
                          <span className="font-semibold">{cfg.label}</span>
                          <span className="text-[10px] opacity-60">{cfg.shortcut}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* All done state */}
      {totalLoaded > 0 && cards.length === 0 && (
        <Card className="border-jade/20 bg-jade/5 dark:bg-jade/10">
          <CardContent className="flex flex-col items-center text-center py-8 space-y-3">
            <CheckCircle2 className="h-10 w-10 text-jade" />
            <div>
              <p className="font-semibold text-foreground">Session complete!</p>
              <p className="text-sm text-muted-foreground mt-1">You reviewed all {totalLoaded} due cards. Great work.</p>
            </div>
            <Button variant="outline" size="sm" onClick={loadDue}>
              <RefreshCw className="h-4 w-4" />
              Check for more cards
            </Button>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Speaking practice */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold">Speaking practice</h2>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Say this phrase</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-lg font-medium">
              <span className="hanzi text-2xl">我今天想点一杯茶。</span>
            </p>
            <p className="text-xs text-muted-foreground">Wǒ jīntiān xiǎng diǎn yī bēi chá. — I want to order a cup of tea today.</p>

            <div className="flex items-center gap-2">
              <Button
                variant={isListening ? "default" : "outline"}
                size="sm"
                onClick={startSpeechInput}
                className={cn(isListening && "bg-crimson text-crimson-foreground border-crimson")}
              >
                {isListening ? (
                  <><Mic className="h-4 w-4 animate-pulse" />Listening…</>
                ) : (
                  <><Mic className="h-4 w-4" />Speak</>
                )}
              </Button>
              {spokenText && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setSpokenText("")}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
            </div>

            {spokenText && (
              <div className="rounded-lg bg-muted px-3 py-2 animate-fade-in">
                <p className="text-xs text-muted-foreground mb-1">Captured:</p>
                <p className="text-sm font-medium">{spokenText}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Character mini-practice */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold">Character recognition</h2>
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col items-center gap-1">
                <span className="hanzi text-6xl leading-none">{currentCharacter.hanzi}</span>
                <Badge variant="secondary" className="text-xs">{currentCharacter.meaning}</Badge>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground mb-2">Type the pinyin with tone number:</p>
                <p className="text-xs text-muted-foreground">e.g. <code className="bg-muted px-1 rounded">ni3</code></p>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                value={characterInput}
                onChange={(e) => setCharacterInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") checkCharacterAnswer(); }}
                placeholder="Type pinyin + tone…"
                className={cn(
                  "flex-1 transition-colors",
                  charFeedback === "correct" && "border-jade focus-visible:ring-jade",
                  charFeedback === "wrong" && "border-destructive focus-visible:ring-destructive"
                )}
              />
              <Button onClick={checkCharacterAnswer} variant="outline">
                Check
              </Button>
            </div>

            {charFeedback && (
              <div className={cn(
                "flex items-center gap-2 text-sm rounded-md px-3 py-2 animate-fade-in",
                charFeedback === "correct"
                  ? "bg-jade/10 text-jade"
                  : "bg-destructive/10 text-destructive"
              )}>
                {charFeedback === "correct" ? (
                  <><CheckCircle2 className="h-4 w-4" />Correct! <span className="hanzi">{currentCharacter.hanzi}</span> = {currentCharacter.pinyin}</>
                ) : (
                  <><XCircle className="h-4 w-4" />Not quite. Hint: starts with &ldquo;{currentCharacter.pinyin[0]}&rdquo;</>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
