"use client";

import { useEffect, useState } from "react";
import {
  BarChart2,
  BookOpen,
  Calendar,
  Clock,
  Flame,
  RefreshCw,
  Loader2,
  TrendingUp,
  AlertTriangle,
  Sparkles
} from "lucide-react";
import { authedFetch } from "@/lib/authed-fetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Summary = {
  totalSessions: number;
  totalMinutes: number;
  streakDays: number;
  vocabLearning: number;
  dueCards: number;
  weakAreas: string[];
};

const STAT_CARDS = [
  {
    key: "totalSessions" as const,
    label: "Sessions",
    icon: Calendar,
    format: (v: number) => String(v),
    desc: "total sessions",
    color: "text-foreground"
  },
  {
    key: "totalMinutes" as const,
    label: "Minutes",
    icon: Clock,
    format: (v: number) => v >= 60 ? `${Math.floor(v / 60)}h ${v % 60}m` : `${v}m`,
    desc: "practice time",
    color: "text-foreground"
  },
  {
    key: "streakDays" as const,
    label: "Streak",
    icon: Flame,
    format: (v: number) => `${v}d`,
    desc: "days in a row",
    color: "text-orange-500"
  },
  {
    key: "vocabLearning" as const,
    label: "Vocabulary",
    icon: BookOpen,
    format: (v: number) => String(v),
    desc: "words in learning",
    color: "text-jade"
  }
];

function nextWeekFocusTags(weakAreas: string[]): string[] {
  const baseTags = ["SRS review"];
  if (weakAreas.length > 0) {
    return [...weakAreas.slice(0, 2).map((a) => a.charAt(0).toUpperCase() + a.slice(1)), ...baseTags];
  }
  return ["Conversation practice", "New vocabulary", ...baseTags];
}

export default function ProgressPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recap, setRecap] = useState<string | null>(null);
  const [recapLoading, setRecapLoading] = useState(true);

  async function refresh() {
    setIsLoading(true);
    setRecapLoading(true);
    const response = await authedFetch("/api/progress/summary");
    setIsLoading(false);
    if (!response.ok) {
      setSummary(null);
    } else {
      const data = await response.json();
      setSummary(data.summary ?? null);
    }

    const recapRes = await authedFetch("/api/progress/weekly-recap");
    setRecapLoading(false);
    if (recapRes.ok) {
      const recapData = await recapRes.json();
      setRecap(recapData.recap ?? null);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const dueCards = summary?.dueCards ?? 0;
  const weakAreas = summary?.weakAreas ?? [];
  const focusTags = nextWeekFocusTags(weakAreas);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
          <p className="text-sm text-muted-foreground">Your Mandarin learning journey at a glance.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Stat grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 w-4 rounded bg-muted" />
                  <div className="h-7 w-16 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {STAT_CARDS.map(({ key, label: _label, icon: Icon, format, desc, color }) => (
            <Card key={key}>
              <CardContent className="p-5 space-y-2">
                <Icon className={cn("h-4 w-4", color)} />
                <div>
                  <p className={cn("text-2xl font-bold leading-tight", color)}>
                    {format(summary?.[key] ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Due cards banner */}
      {!isLoading && dueCards > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
          <CardContent className="flex items-center justify-between p-4 gap-3">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {dueCards} card{dueCards !== 1 ? "s" : ""} due for review
                </p>
                <p className="text-xs text-amber-700/70 dark:text-amber-400/70">
                  Review them now to keep your memory strong
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/30"
              asChild
            >
              <a href="/review">Review</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* AI-generated weekly recap */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Your week in Mandarin</CardTitle>
          </div>
          <CardDescription>An AI-generated summary of your recent learning activity.</CardDescription>
        </CardHeader>
        <CardContent>
          {recapLoading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-4 w-full rounded bg-muted" />
              <div className="h-4 w-4/5 rounded bg-muted" />
              <div className="h-4 w-3/5 rounded bg-muted" />
            </div>
          ) : recap ? (
            <p className="text-sm text-foreground leading-relaxed">{recap}</p>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">
              Complete your first session to unlock your weekly recap.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Weekly summary stats */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Weekly targets</CardTitle>
          </div>
          <CardDescription>Progress toward your weekly practice goals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sessions completed</span>
              <span className="font-medium">{summary?.totalSessions ?? 0} / 7</span>
            </div>
            <Progress value={Math.min((summary?.totalSessions ?? 0) / 7 * 100, 100)} className="h-1.5" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Minutes practiced</span>
              <span className="font-medium">{summary?.totalMinutes ?? 0} / 70 min</span>
            </div>
            <Progress value={Math.min((summary?.totalMinutes ?? 0) / 70 * 100, 100)} className="h-1.5" />
          </div>
        </CardContent>
      </Card>

      {/* Weak areas */}
      {weakAreas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base">Areas to focus on</CardTitle>
            </div>
            <CardDescription>These topics need more attention based on your performance.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {weakAreas.map((area) => (
                <Badge key={area} variant="amber">{area}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next week focus — driven by weak areas */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Suggested next steps</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-foreground leading-relaxed">
            {weakAreas.length > 0
              ? `Focus on your weak areas: ${weakAreas.join(", ")}. Keep reviewing due cards daily to reinforce retention.`
              : "Keep up your daily sessions to build consistency. Review your SRS cards to reinforce what you've learned."}
          </p>
          <div className="flex flex-wrap gap-2">
            {focusTags.map((tag) => (
              <Badge key={tag} variant="secondary">{tag}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
