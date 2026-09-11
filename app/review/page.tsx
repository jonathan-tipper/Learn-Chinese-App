"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Headphones,
  Loader2,
  Mic,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Volume2,
  XCircle
} from "lucide-react";
import { authedFetch } from "@/lib/authed-fetch";
import type { PronunciationScore, SpeakingPrompt, SyllableStatus } from "@/lib/pronunciation";
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
type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
  message?: string;
};
type BrowserSpeechRecognitionLike = {
  lang: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onnomatch?: (() => void) | null;
  start: () => void;
  stop?: () => void;
  abort?: () => void;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognitionLike;
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

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

const SYLLABLE_STYLES: Record<SyllableStatus, { chip: string; label: string }> = {
  match: { chip: "border-jade/40 bg-jade/10 text-foreground", label: "Good" },
  tone: { chip: "border-amber-400/60 bg-amber-100/60 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200", label: "Tone" },
  sound: { chip: "border-destructive/40 bg-destructive/10 text-foreground", label: "Sound" },
  missing: { chip: "border-dashed border-muted-foreground/40 text-muted-foreground line-through", label: "Missed" },
  extra: { chip: "border-dotted border-muted-foreground/40 text-muted-foreground", label: "Extra" }
};

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

function getSpeechRecognitionErrorMessage(event: SpeechRecognitionErrorEventLike): string {
  switch (event.error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow microphone access and try again.";
    case "no-speech":
      return "No speech was detected. Try again in a quieter spot.";
    case "audio-capture":
      return "No microphone was detected. Check your microphone input and try again.";
    case "network":
      return "Speech recognition could not reach the browser speech service. Check your connection or VPN and try again.";
    case "language-not-supported":
      return "Mandarin speech recognition is not available in this browser. Try Chrome, Edge, or Safari.";
    case "aborted":
      return "Listening was cancelled before anything was captured.";
    case "bad-grammar":
      return "Speech recognition could not start with the current grammar settings. Try again.";
    default:
      return event.error
        ? `Speech input failed with browser error "${event.error}". Try again.`
        : "Speech input stopped before anything was captured. Try again.";
  }
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
  const [speechError, setSpeechError] = useState("");
  const [prompts, setPrompts] = useState<SpeakingPrompt[]>([]);
  const [promptIndex, setPromptIndex] = useState(0);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [scoreResult, setScoreResult] = useState<PronunciationScore | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const speakSessionIdRef = useRef<string | null>(null);
  const [characterInput, setCharacterInput] = useState("");
  const [characterIndex, setCharacterIndex] = useState(0);
  const [charFeedback, setCharFeedback] = useState<"correct" | "wrong" | null>(null);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognitionLike | null>(null);
  const speechStopRequestedRef = useRef(false);

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
        // Chinese text must go to the Chinese-capable voice.
        body: JSON.stringify(CJK_RE.test(text) ? { text, speed: 0.85, lang: "zh" } : { text, speed: 0.85 })
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
  const currentPrompt = prompts[promptIndex % Math.max(1, prompts.length)];

  const loadPrompts = useCallback(async (refresh = false) => {
    setPromptsLoading(true);
    try {
      const response = await authedFetch(`/api/speaking/prompts${refresh ? "?refresh=1" : ""}`);
      if (!response.ok) return;
      const data = await response.json() as { prompts: SpeakingPrompt[] };
      if (Array.isArray(data.prompts) && data.prompts.length > 0) {
        setPrompts(data.prompts);
        setPromptIndex(0);
        setScoreResult(null);
        setSpokenText("");
      }
    } catch {
      // keep whatever we have
    } finally {
      setPromptsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

  async function ensureSpeakingSession() {
    if (speakSessionIdRef.current) return speakSessionIdRef.current;
    const response = await authedFetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "quick" })
    });
    if (!response.ok) return null;
    const data = await response.json() as { sessionId: string };
    speakSessionIdRef.current = data.sessionId;
    return data.sessionId;
  }

  async function scoreTranscript(transcript: string, target: string) {
    setIsScoring(true);
    setScoreResult(null);
    try {
      const sessionId = await ensureSpeakingSession().catch(() => null);
      const response = await authedFetch("/api/speech/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, transcript, ...(sessionId ? { sessionId } : {}) })
      });
      if (!response.ok) {
        setSpeechError("Could not score that attempt. Try again.");
        return;
      }
      setScoreResult(await response.json() as PronunciationScore);
    } catch {
      setSpeechError("Could not reach the pronunciation coach. Check your connection and try again.");
    } finally {
      setIsScoring(false);
    }
  }

  function nextPrompt() {
    setSpokenText("");
    setSpeechError("");
    setScoreResult(null);
    setPromptIndex((index) => index + 1);
  }

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

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.abort?.();
      speechRecognitionRef.current = null;
    };
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
    if (isListening) {
      speechStopRequestedRef.current = true;
      speechRecognitionRef.current?.stop?.();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as SpeechRecognitionWindow).SpeechRecognition
      ?? (window as SpeechRecognitionWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechError("Speech input is unavailable in this browser. Try Chrome, Edge, or Safari with microphone access enabled.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      speechStopRequestedRef.current = false;
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      if (transcript.trim()) {
        setSpokenText(transcript);
        setSpeechError("");
        if (currentPrompt) void scoreTranscript(transcript, currentPrompt.hanzi);
      } else {
        setSpeechError("No speech was captured. Try again in a quieter spot.");
      }
      setIsListening(false);
    };
    recognition.onerror = (event) => {
      if (!(speechStopRequestedRef.current && event.error === "aborted")) {
        setSpeechError(getSpeechRecognitionErrorMessage(event));
      }
      speechStopRequestedRef.current = false;
      setIsListening(false);
    };
    recognition.onnomatch = () => {
      speechStopRequestedRef.current = false;
      setSpeechError("No Mandarin phrase was recognized. Try speaking a little more slowly.");
      setIsListening(false);
    };
    recognition.onend = () => {
      speechStopRequestedRef.current = false;
      setIsListening(false);
      speechRecognitionRef.current = null;
    };

    try {
      speechRecognitionRef.current = recognition;
      speechStopRequestedRef.current = false;
      setSpeechError("");
      setSpokenText("");
      recognition.start();
      setIsListening(true);
    } catch {
      speechRecognitionRef.current = null;
      speechStopRequestedRef.current = false;
      setIsListening(false);
      setSpeechError("Speech input could not start. Check microphone permissions and try again.");
    }
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

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-crimson/10 text-crimson">
              <Headphones className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Tone minimal pairs</h2>
              <p className="text-sm text-muted-foreground">
                Practice listening for Mandarin tone contrasts without changing your SRS queue.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href="/tone-practice">
              Start drill
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

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
                    <Link
                      href={`/characters?entry=${encodeURIComponent(displayPrompt)}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Explore character
                      <ChevronRight className="h-3 w-3" />
                    </Link>
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Speaking practice</h2>
            <p className="text-xs text-muted-foreground">
              {currentPrompt?.source === "plan"
                ? "Phrases from today's plan and your vocabulary."
                : currentPrompt?.source === "vocab"
                  ? "Phrases built from words you've met."
                  : "Say the phrase; the coach checks each syllable."}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void loadPrompts(true)} disabled={promptsLoading}>
            <Shuffle className={cn("h-3.5 w-3.5", promptsLoading && "animate-spin")} />
            New phrases
          </Button>
        </div>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Say this phrase{prompts.length > 1 ? ` · ${(promptIndex % prompts.length) + 1} of ${prompts.length}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {promptsLoading && !currentPrompt ? (
              <div className="animate-pulse space-y-2">
                <div className="h-8 w-56 rounded bg-muted" />
                <div className="h-3 w-72 rounded bg-muted" />
              </div>
            ) : currentPrompt ? (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="hanzi text-2xl font-medium">{currentPrompt.hanzi}</p>
                  <p className="text-xs text-muted-foreground mt-1">{currentPrompt.pinyin} — {currentPrompt.english}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => void playTts("speaking-prompt", currentPrompt.hanzi)}
                  disabled={ttsLoadingId === "speaking-prompt"}
                  aria-label="Play the phrase"
                >
                  {ttsLoadingId === "speaking-prompt" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={isListening ? "default" : "outline"}
                size="sm"
                onClick={startSpeechInput}
                disabled={!currentPrompt || isScoring}
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
                  onClick={() => {
                    setSpokenText("");
                    setSpeechError("");
                    setScoreResult(null);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
              {prompts.length > 1 && (
                <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={nextPrompt}>
                  Next phrase
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {speechError && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive animate-fade-in">
                <XCircle className="h-3.5 w-3.5 shrink-0" />
                {speechError}
              </div>
            )}

            {isScoring && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking each syllable…
              </p>
            )}

            {scoreResult && (
              <div className="space-y-3 animate-fade-in">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={scoreResult.verdict === "great" ? "jade" : scoreResult.verdict === "close" ? "amber" : "destructive"}>
                    {scoreResult.score}% · {scoreResult.verdict === "great" ? "Great" : scoreResult.verdict === "close" ? "Close" : "Try again"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">Heard: {scoreResult.heardText || "nothing"}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {scoreResult.results.map((result, index) => {
                    const syllable = result.status === "extra" ? result.heard : result.target;
                    if (!syllable) return null;
                    const style = SYLLABLE_STYLES[result.status];
                    return (
                      <div
                        key={`${index}-${syllable.hanzi}`}
                        className={cn("flex flex-col items-center rounded-lg border px-2.5 py-1.5 min-w-[3rem]", style.chip)}
                        title={result.note ?? style.label}
                      >
                        <span className="hanzi text-lg leading-none">{syllable.hanzi}</span>
                        <span className="text-[10px] mt-1">{syllable.pinyin}</span>
                        {result.status !== "match" && (
                          <span className="text-[9px] uppercase tracking-wide opacity-80">{style.label}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {scoreResult.tips.length > 0 && (
                  <ul className="space-y-1.5">
                    {scoreResult.tips.map((tip, index) => (
                      <li key={index} className="flex items-start gap-2 text-xs text-foreground/90">
                        <span className="text-jade mt-0.5">·</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {scoreResult.weakAreas && scoreResult.weakAreas.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Noted for your coach: {scoreResult.weakAreas.join(", ")}.
                  </p>
                )}
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
