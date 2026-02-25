"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Play,
  RotateCcw,
  BookmarkPlus,
  FlaskConical,
  Layers,
  ChevronDown,
  ChevronUp,
  Loader2,
  Settings2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  BookOpen
} from "lucide-react";
import { authedFetch } from "@/lib/authed-fetch";
import { VENICE_MODEL_OPTIONS } from "@/lib/venice";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type Structured = {
  answer: string;
  keyPoints: string[];
  examples: string[];
  microExercise: string;
  suggestedReviewItems: string[];
};

type ChatTurn = {
  user: string;
  assistant: Structured | null;
  loading?: boolean;
};

function parseSse(raw: string) {
  const events = raw
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => chunk.replace(/^data:\s*/, ""));

  const parsed = events
    .map((event) => {
      try { return JSON.parse(event); } catch { return null; }
    })
    .filter(Boolean);

  const finalEvent = parsed.find((event: { type?: string }) => event.type === "final");
  return finalEvent?.structured ?? null;
}

function CoachBubble({ turn }: { turn: ChatTurn }) {
  const [showDetails, setShowDetails] = useState(true);
  const hasDetails = (turn.assistant?.keyPoints?.length ?? 0) > 0
    || (turn.assistant?.examples?.length ?? 0) > 0
    || !!turn.assistant?.microExercise;

  return (
    <div className="flex items-start gap-3 max-w-[85%] animate-fade-in">
      {/* Coach avatar */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background text-xs font-bold mt-0.5">
        汉
      </div>

      <div className="flex-1 space-y-2">
        {turn.loading ? (
          <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-secondary px-4 py-3 text-sm text-secondary-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Coach is thinking…</span>
          </div>
        ) : (
          <>
            {/* Main answer bubble */}
            <div className="rounded-2xl rounded-tl-sm bg-secondary px-4 py-3">
              <p className="text-sm leading-relaxed text-secondary-foreground">
                {turn.assistant?.answer ?? "No structured response"}
              </p>
            </div>

            {/* Expandable details */}
            {hasDetails && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {showDetails ? "Hide details" : "Show key points, examples & exercise"}
                </button>

                {showDetails && (
                  <div className="rounded-xl border bg-card p-3 space-y-3 animate-fade-in">
                    {(turn.assistant?.keyPoints?.length ?? 0) > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Key points</p>
                        <ul className="space-y-1">
                          {turn.assistant!.keyPoints.map((pt, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <span className="text-jade mt-0.5">·</span>
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(turn.assistant?.examples?.length ?? 0) > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Examples</p>
                        <ul className="space-y-1.5">
                          {turn.assistant!.examples.map((ex, i) => (
                            <li key={i} className="rounded-lg bg-muted px-3 py-2 text-sm font-medium">
                              {ex}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {turn.assistant?.microExercise && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick exercise</p>
                        <div className="rounded-lg border border-jade/20 bg-jade/5 px-3 py-2 text-sm text-foreground">
                          {turn.assistant.microExercise}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [sessionId, setSessionId] = useState<string>("");
  const [input, setInput] = useState("Teach me how to order tea politely.");
  const [verifyMode, setVerifyMode] = useState(false);
  const [modelSelectionMode, setModelSelectionMode] = useState<"auto" | "simple" | "complex" | "custom">("auto");
  const [customModel, setCustomModel] = useState("zai-org-glm-5");
  const [modelOptions, setModelOptions] = useState<string[]>([...VENICE_MODEL_OPTIONS]);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<"idle" | "active" | "ended">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSend = useMemo(
    () => !!sessionId && input.trim().length > 0 && !isLoading,
    [input, sessionId, isLoading]
  );

  // Auto-scroll to bottom when turns update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/models");
        if (!response.ok) return;
        const data = await response.json();
        if (Array.isArray(data.models) && data.models.length > 0) {
          setModelOptions(data.models);
        }
      } catch {
        // Keep local fallback
      }
    })();
  }, []);

  async function startSession() {
    const response = await authedFetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "daily" })
    });
    if (!response.ok) {
      const text = await response.text();
      setStatusMsg(`Error: ${text}`);
      return;
    }
    const data = await response.json();
    setSessionId(data.sessionId);
    setSessionStatus("active");
    setStatusMsg("");
    inputRef.current?.focus();
  }

  async function endSession() {
    if (!sessionId) return;
    const response = await authedFetch("/api/session/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, durationSec: Math.max(60, turns.length * 90), summary: "Session complete" })
    });
    if (!response.ok) {
      const text = await response.text();
      setStatusMsg(`Error: ${text}`);
      return;
    }
    localStorage.setItem("lastSessionDate", new Date().toISOString().slice(0, 10));
    setSessionStatus("ended");
    setSessionId("");
    setStatusMsg("Session complete. Great work today! 🎉");
  }

  async function send(intent?: "more_examples" | "quiz_me", saveToReview = false) {
    if (!canSend) return;
    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    // Optimistically add user turn with loading state
    setTurns((prev) => [...prev, { user: userMessage, assistant: null, loading: true }]);

    const payload = {
      sessionId,
      message: userMessage,
      verifyMode,
      intent,
      saveToReview,
      modelSelectionMode,
      customModel: modelSelectionMode === "custom" ? customModel : undefined
    };
    const response = await authedFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    setIsLoading(false);

    if (!response.ok) {
      setTurns((prev) => prev.slice(0, -1));
      setStatusMsg(`Error: ${text}`);
      return;
    }

    const structured = parseSse(text);
    setTurns((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = { user: userMessage, assistant: structured, loading: false };
      return updated;
    });
    setStatusMsg(saveToReview ? "Saved to review cards!" : "");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) send();
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-4rem)] -mt-6 lg:-mt-8 -mx-4 lg:-mx-8">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 lg:px-8 py-3 border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-sm font-semibold">Mandarin Coach</h1>
            <div className="flex items-center gap-1.5">
              {sessionStatus === "active" ? (
                <Badge variant="jade" className="text-xs gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-jade-foreground animate-pulse" />
                  Session active
                </Badge>
              ) : sessionStatus === "ended" ? (
                <Badge variant="secondary" className="text-xs">Session ended</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs text-muted-foreground">No active session</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Verify mode toggle */}
          <button
            type="button"
            onClick={() => setVerifyMode((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              verifyMode
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Verify
          </button>

          {/* Settings toggle */}
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              showSettings
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>

          {sessionStatus !== "active" ? (
            <Button size="sm" onClick={startSession}>
              <Play className="h-3.5 w-3.5" />
              Start
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={endSession}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              End
            </Button>
          )}
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="px-4 lg:px-8 py-3 border-b bg-secondary/30 flex flex-wrap items-center gap-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Model:</span>
            <Select value={modelSelectionMode} onValueChange={(v) => setModelSelectionMode(v as typeof modelSelectionMode)}>
              <SelectTrigger className="h-7 text-xs w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="simple">Fast</SelectItem>
                <SelectItem value="complex">Deep</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {modelSelectionMode === "custom" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Custom model:</span>
              <input
                list="venice-model-options"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                className="h-7 text-xs px-2 rounded-md border bg-background w-48"
              />
              <datalist id="venice-model-options">
                {modelOptions.map((m) => <option key={m} value={m} />)}
              </datalist>
            </div>
          )}
        </div>
      )}

      {/* Status messages */}
      {statusMsg && (
        <div className="px-4 lg:px-8 py-2 border-b">
          <div className={cn(
            "flex items-center gap-2 text-xs rounded-md px-3 py-2",
            statusMsg.startsWith("Error")
              ? "bg-destructive/10 text-destructive"
              : "bg-jade/10 text-jade"
          )}>
            {statusMsg.startsWith("Error") ? (
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            )}
            {statusMsg}
          </div>
        </div>
      )}

      {/* Conversation area */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="px-4 lg:px-8 py-6 space-y-6">
          {turns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div className="text-4xl font-bold text-foreground/10 select-none">你好</div>
              <p className="text-sm text-muted-foreground max-w-xs">
                {sessionStatus === "active"
                  ? "Ask your coach anything — vocabulary, grammar, pronunciation, or conversation practice."
                  : "Start a session to begin your Mandarin practice with your AI coach."}
              </p>
              {sessionStatus !== "active" && (
                <Button size="sm" onClick={startSession} className="mt-2">
                  <Play className="h-4 w-4" />
                  Start session
                </Button>
              )}
            </div>
          ) : (
            turns.map((turn, index) => (
              <div key={`turn-${index}`} className="space-y-3">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-3">
                    <p className="text-sm leading-relaxed">{turn.user}</p>
                  </div>
                </div>

                {/* Coach response */}
                <CoachBubble turn={turn} />
              </div>
            ))
          )}
        </div>
      </div>

      <Separator />

      {/* Input area */}
      <div className="px-4 lg:px-8 py-3 bg-background space-y-2">
        <div className="flex gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={sessionStatus === "active" ? "Ask anything… (Enter to send, Shift+Enter for newline)" : "Start a session first"}
            disabled={sessionStatus !== "active"}
            className="flex-1 min-h-[44px] max-h-32 text-sm resize-none"
            rows={1}
          />
          <Button
            size="icon"
            onClick={() => send()}
            disabled={!canSend}
            className="h-11 w-11 shrink-0 self-end"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        {/* Action row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2.5 text-muted-foreground"
            onClick={() => send("more_examples")}
            disabled={!canSend}
          >
            <Layers className="h-3 w-3" />
            Examples
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2.5 text-muted-foreground"
            onClick={() => send("quiz_me")}
            disabled={!canSend}
          >
            <FlaskConical className="h-3 w-3" />
            Quiz me
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2.5 text-muted-foreground"
            onClick={() => send(undefined, true)}
            disabled={!canSend}
          >
            <BookmarkPlus className="h-3 w-3" />
            Save to review
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2.5 text-muted-foreground ml-auto"
            onClick={() => setTurns([])}
            disabled={turns.length === 0}
          >
            <RotateCcw className="h-3 w-3" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
