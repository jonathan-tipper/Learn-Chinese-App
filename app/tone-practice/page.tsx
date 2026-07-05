"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Headphones,
  Loader2,
  MessageCircle,
  RotateCcw,
  Volume2,
  XCircle
} from "lucide-react";
import { authedFetch } from "@/lib/authed-fetch";
import {
  buildTonePracticeAttempt,
  getTonePracticePrompts,
  summarizeTonePracticeAttempts,
  type TonePracticeAttempt
} from "@/lib/tone-practice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const DRILL_PROMPTS = getTonePracticePrompts(6);

export default function TonePracticePage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attempts, setAttempts] = useState<TonePracticeAttempt[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [ttsState, setTtsState] = useState<"idle" | "loading" | "error">("idle");
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentPrompt = DRILL_PROMPTS[currentIndex];
  const isComplete = currentIndex >= DRILL_PROMPTS.length;
  const summary = useMemo(() => summarizeTonePracticeAttempts(attempts), [attempts]);
  const progressValue = (attempts.length / DRILL_PROMPTS.length) * 100;
  const promptPosition = isComplete ? DRILL_PROMPTS.length : currentIndex + 1;
  const currentAttempt = selectedAnswer && currentPrompt
    ? buildTonePracticeAttempt(currentPrompt, selectedAnswer)
    : null;
  const answeredCorrectly = currentAttempt?.result === "correct";

  useEffect(() => {
    function updateOnline() {
      setOnline(navigator.onLine);
    }

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  async function playPromptAudio() {
    if (!currentPrompt || !online) {
      setTtsState("error");
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setTtsState("loading");
    try {
      const response = await authedFetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: currentPrompt.audioText, lang: "zh", speed: 0.85 })
      });

      if (!response.ok) throw new Error("TTS request failed");

      const data = await response.json();
      const audio = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
      audioRef.current = audio;
      await audio.play();
      setTtsState("idle");
    } catch {
      setTtsState("error");
    }
  }

  function chooseAnswer(choiceId: string) {
    if (!currentPrompt || selectedAnswer) return;
    setSelectedAnswer(choiceId);
    setAttempts((previous) => [
      ...previous,
      buildTonePracticeAttempt(currentPrompt, choiceId)
    ]);
  }

  function goNext() {
    setSelectedAnswer(null);
    setTtsState("idle");
    setCurrentIndex((index) => index + 1);
  }

  function restartDrill() {
    setCurrentIndex(0);
    setAttempts([]);
    setSelectedAnswer(null);
    setTtsState("idle");
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Badge variant="secondary" className="gap-1 text-xs">
            <Headphones className="h-3 w-3" />
            Tone contrast drill
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight">Tone Minimal Pairs</h1>
          <p className="text-sm text-muted-foreground">
            Hear a Mandarin word, choose the matching tone, and get immediate feedback.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/review">
            <BookOpen className="h-4 w-4" />
            Review cards
          </Link>
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{promptPosition} of {DRILL_PROMPTS.length}</span>
          <span>{summary.correctCount} correct</span>
        </div>
        <Progress value={progressValue} className="h-1.5" />
      </div>

      {isComplete ? (
        <Card className="border-jade/20 bg-jade/5 dark:bg-jade/10">
          <CardContent className="space-y-5 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-jade/10 text-jade">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Drill complete</h2>
                <p className="text-sm text-muted-foreground">
                  {summary.correctCount} of {summary.attemptedCount} correct.
                  {summary.missedTonePairs.length > 0
                    ? ` Focus next on tone pairs ${summary.missedTonePairs.join(", ")}.`
                    : " No missed tone pairs in this round."}
                </p>
              </div>
            </div>

            {summary.missedTonePairs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {summary.missedTonePairs.map((pair) => (
                  <Badge key={pair} variant="secondary">Tone {pair}</Badge>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={restartDrill}>
                <RotateCcw className="h-4 w-4" />
                Try again
              </Button>
              <Button variant="outline" asChild>
                <Link href="/chat">
                  <MessageCircle className="h-4 w-4" />
                  Ask coach
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/review">
                  <BookOpen className="h-4 w-4" />
                  Back to review
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        currentPrompt && (
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-5 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <Badge variant="outline" className="text-xs">Tone {currentPrompt.toneContrast}</Badge>
                    <h2 className="text-lg font-semibold">Which word did you hear?</h2>
                    <p className="text-sm text-muted-foreground">{currentPrompt.hint}</p>
                  </div>
                  <Button onClick={() => void playPromptAudio()} disabled={ttsState === "loading" || !online}>
                    {ttsState === "loading" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                    Play audio
                  </Button>
                </div>

                {(ttsState === "error" || !online) && (
                  <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                    Audio is unavailable right now. You can still answer from the pinyin and tone labels.
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {currentPrompt.choices.map((choice) => {
                    const isSelected = selectedAnswer === choice.id;
                    const isCorrect = choice.id === currentPrompt.correctOption.id;
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => chooseAnswer(choice.id)}
                        disabled={Boolean(selectedAnswer)}
                        className={cn(
                          "min-h-32 rounded-lg border bg-card p-4 text-left transition-colors",
                          "hover:border-foreground/30 disabled:cursor-default",
                          selectedAnswer && isCorrect && "border-jade bg-jade/10",
                          selectedAnswer && isSelected && !isCorrect && "border-destructive bg-destructive/10"
                        )}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="space-y-1">
                            <span className="hanzi block text-4xl leading-none">{choice.hanzi}</span>
                            <span className="block text-base font-semibold">{choice.pinyin}</span>
                            <span className="block text-sm text-muted-foreground">{choice.gloss}</span>
                          </span>
                          <Badge variant="secondary" className="text-xs">Tone {choice.toneNumber}</Badge>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {selectedAnswer && (
              <Card className={cn(answeredCorrectly ? "border-jade/30" : "border-destructive/30")}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    {answeredCorrectly ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-jade" />
                    ) : (
                      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                    )}
                    <div className="space-y-1">
                      <p className="font-medium">{answeredCorrectly ? "Correct" : "Not this time"}</p>
                      <p className="text-sm text-muted-foreground">{currentPrompt.explanation}</p>
                    </div>
                  </div>
                  <Button onClick={goNext}>
                    {currentIndex === DRILL_PROMPTS.length - 1 ? "Finish" : "Next"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )
      )}
    </div>
  );
}
