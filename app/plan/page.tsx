"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Ear,
  Loader2,
  MessageCircle,
  PenLine,
  RefreshCw,
  Sparkles,
  Target,
  Mic,
  Eye
} from "lucide-react";
import { authedFetch } from "@/lib/authed-fetch";
import type { LearningPlan, LearningPlanItem, PlanModality } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PlanResponse = {
  plan: LearningPlan | null;
  today: LearningPlanItem | null;
  todayDate?: string;
  generated?: boolean;
};

const MODALITY_META: Record<PlanModality, { label: string; icon: React.ElementType }> = {
  speaking: { label: "Speaking", icon: Mic },
  listening: { label: "Listening", icon: Ear },
  reading: { label: "Reading", icon: Eye },
  writing: { label: "Writing", icon: PenLine },
  review: { label: "Review", icon: BookOpen }
};

function weekdayLabel(isoDate: string) {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function PlanItemCard({ item, isToday, isPast }: { item: LearningPlanItem; isToday: boolean; isPast: boolean }) {
  const completed = item.status === "completed";
  return (
    <Card
      className={cn(
        "transition-colors",
        isToday && "border-foreground/40 shadow-md",
        completed && "border-jade/40 bg-jade/5 dark:bg-jade/10",
        isPast && !completed && "opacity-70"
      )}
    >
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Day {item.day} · {weekdayLabel(item.date)}
              </span>
              {isToday && <Badge variant="default" className="text-[10px]">Today</Badge>}
              {completed && (
                <Badge variant="jade" className="text-[10px] gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Done
                </Badge>
              )}
              {isPast && !completed && <Badge variant="secondary" className="text-[10px]">Missed</Badge>}
            </div>
            <h3 className="text-base font-semibold leading-tight">{item.title}</h3>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs">~{item.estimatedMinutes} min</Badge>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2">
          <Target className="h-4 w-4 mt-0.5 shrink-0 text-jade" />
          <p className="text-sm font-medium">{item.canDo}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Lesson</p>
            <p className="text-foreground leading-relaxed">{item.lessonFocus}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Review</p>
            <p className="text-foreground leading-relaxed">{item.reviewFocus}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {item.modalities.map((modality) => {
            const meta = MODALITY_META[modality];
            const Icon = meta.icon;
            return (
              <Badge key={modality} variant="outline" className="gap-1 text-[11px]">
                <Icon className="h-3 w-3" />
                {meta.label}
              </Badge>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground italic">Why: {item.reason}</p>
        {item.note && (
          <p className="text-xs text-jade">Session note: {item.note}</p>
        )}

        {isToday && !completed && (
          <Button size="sm" asChild className="w-full sm:w-auto">
            <Link href="/chat">
              <MessageCircle className="h-4 w-4" />
              Start today&apos;s session
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function PlanPage() {
  const [data, setData] = useState<PlanResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (regenerate = false) => {
    if (regenerate) setIsRegenerating(true);
    else setIsLoading(true);
    setError("");
    try {
      const response = await authedFetch("/api/plan", { method: regenerate ? "POST" : "GET" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error ?? "Could not load your plan.");
        return;
      }
      setData(await response.json() as PlanResponse);
    } catch {
      setError("Could not reach the planner. Check your connection and try again.");
    } finally {
      setIsLoading(false);
      setIsRegenerating(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const plan = data?.plan ?? null;
  const todayDate = data?.todayDate;
  const completedCount = plan?.items.filter((item) => item.status === "completed").length ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <Badge variant="secondary" className="gap-1 text-xs">
            <CalendarDays className="h-3 w-3" />
            Rolling 7-day plan
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight">Your week in Mandarin</h1>
          <p className="text-sm text-muted-foreground">
            Planned from your goals, recent sessions, weak spots and review load. It updates as you practise.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={isRegenerating || isLoading}>
          {isRegenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Replan week
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="animate-pulse space-y-3">
                  <div className="h-3 w-24 rounded bg-muted" />
                  <div className="h-5 w-48 rounded bg-muted" />
                  <div className="h-10 w-full rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground text-center">
            First plan can take a few seconds while the planner studies your history.
          </p>
        </div>
      ) : plan ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Why this week looks like this</CardTitle>
              </div>
              <CardDescription>
                {completedCount} of {plan.items.length} days done · generated {new Date(plan.generatedAt).toLocaleDateString()}
                {plan.model && plan.model !== "fallback-template" ? ` · ${plan.model}` : plan.model === "fallback-template" ? " · starter template" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-relaxed">{plan.rationale || "A balanced week across speaking, listening, reading and review."}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {plan.inputs.weakAreas?.slice(0, 3).map((area) => (
                  <Badge key={area} variant="amber">Weak: {area}</Badge>
                ))}
                {typeof plan.inputs.dueCards === "number" && plan.inputs.dueCards > 0 && (
                  <Badge variant="secondary">{plan.inputs.dueCards} cards due when planned</Badge>
                )}
                {plan.inputs.carriedOver?.slice(0, 2).map((title) => (
                  <Badge key={title} variant="outline">Carried over: {title}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {plan.items.map((item) => (
              <PlanItemCard
                key={item.day}
                item={item}
                isToday={item.date === todayDate}
                isPast={Boolean(todayDate && item.date < todayDate)}
              />
            ))}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              No plan yet. Complete onboarding so the planner knows your goals, then come back here.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/onboarding">Set up your profile</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
