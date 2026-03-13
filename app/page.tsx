"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageCircle, BookOpen, ChevronRight, Flame, Clock, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authedFetch } from "@/lib/authed-fetch";

const GREETINGS = [
  { zh: "早上好", pinyin: "Zǎoshang hǎo", en: "Good morning" },
  { zh: "下午好", pinyin: "Xiàwǔ hǎo", en: "Good afternoon" },
  { zh: "晚上好", pinyin: "Wǎnshang hǎo", en: "Good evening" }
];

type Stats = {
  streakDays: number;
  dueCards: number;
  minutesPerDay: number;
};

type Continuity = {
  sessionDate: string;
  when: string;
  summary: string | null;
  mode: string;
} | null;

export default function HomePage() {
  const [showNudge, setShowNudge] = useState(false);
  const [greetingIdx, setGreetingIdx] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [continuity, setContinuity] = useState<Continuity>(undefined as unknown as Continuity);

  useEffect(() => {
    const hour = new Date().getHours();
    const today = new Date().toISOString().slice(0, 10);
    const lastSessionDate = localStorage.getItem("lastSessionDate");
    setShowNudge(hour >= 18 && lastSessionDate !== today);
    if (hour < 12) setGreetingIdx(0);
    else if (hour < 17) setGreetingIdx(1);
    else setGreetingIdx(2);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [summaryRes, profileRes, continuityRes] = await Promise.all([
          authedFetch("/api/progress/summary"),
          authedFetch("/api/profile"),
          authedFetch("/api/progress/continuity")
        ]);

        const summaryData = summaryRes.ok ? await summaryRes.json() : null;
        const profileData = profileRes.ok ? await profileRes.json() : null;
        const continuityData = continuityRes.ok ? await continuityRes.json() : null;

        setStats({
          streakDays: summaryData?.summary?.streakDays ?? 0,
          dueCards: summaryData?.summary?.dueCards ?? 0,
          minutesPerDay: profileData?.profile?.minutesPerDay ?? 10
        });

        setContinuity(continuityData?.continuity ?? null);
      } catch {
        setContinuity(null);
      }
    })();
  }, []);

  const greeting = GREETINGS[greetingIdx];
  const continuityLoaded = continuity !== (undefined as unknown as Continuity);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Hero greeting */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary" className="text-xs gap-1">
            <Sparkles className="h-3 w-3" />
            Daily session ready
          </Badge>
        </div>
        <h1 className="text-4xl font-bold tracking-tight">
          <span className="hanzi">{greeting.zh}</span>
        </h1>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">{greeting.pinyin}</span>
          {" — "}
          {greeting.en}. Ready to practice Mandarin today?
        </p>
      </div>

      {/* Quick action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="group hover:border-foreground/20 hover:shadow-md transition-all duration-200 cursor-pointer">
          <CardContent className="p-0">
            <Link href="/chat" className="flex items-start gap-4 p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground/5 group-hover:bg-foreground/10 transition-colors">
                <MessageCircle className="h-5 w-5 text-foreground/70" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="font-semibold text-foreground">Daily Session</h2>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Guided conversation with your AI Mandarin coach.
                </p>
                <Badge variant="secondary" className="text-xs">
                  ~{stats?.minutesPerDay ?? 10} min
                </Badge>
              </div>
            </Link>
          </CardContent>
        </Card>

        <Card className="group hover:border-foreground/20 hover:shadow-md transition-all duration-200 cursor-pointer">
          <CardContent className="p-0">
            <Link href="/review" className="flex items-start gap-4 p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-jade/10 group-hover:bg-jade/20 transition-colors">
                <BookOpen className="h-5 w-5 text-jade" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="font-semibold text-foreground">Quick Practice</h2>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Spaced repetition flashcards for due vocabulary.
                </p>
                <Badge variant="secondary" className="text-xs">~2 min</Badge>
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Flame className="h-5 w-5 text-orange-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Streak</p>
              <p className="text-lg font-semibold">
                {stats ? (stats.streakDays > 0 ? `${stats.streakDays}d` : "0d") : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Goal</p>
              <p className="text-lg font-semibold">{stats ? `${stats.minutesPerDay}m` : "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <BookOpen className="h-5 w-5 text-jade shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Due</p>
              <p className="text-lg font-semibold">
                {stats ? (stats.dueCards > 0 ? String(stats.dueCards) : "0") : "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Evening nudge */}
      {showNudge && (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-orange-800 dark:text-orange-400">
              <Flame className="h-4 w-4" />
              Protect your streak tonight
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-orange-700/80 dark:text-orange-300/70">
              You haven&apos;t practiced today yet. Even 2 minutes keeps your streak alive.
            </p>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="border-orange-300 text-orange-800 hover:bg-orange-100 dark:border-orange-800 dark:text-orange-400"
            >
              <Link href="/review">
                <BookOpen className="h-4 w-4" />
                Do quick practice now
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Continuity preview */}
      {continuityLoaded && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Continuity Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {continuity ? (
              <>
                <p className="text-sm text-foreground leading-relaxed">
                  {continuity.when === "today"
                    ? "You already had a session today."
                    : continuity.when === "yesterday"
                    ? "Yesterday's session is ready to build on."
                    : `Your last session was on ${continuity.sessionDate}.`}
                  {continuity.summary ? ` ${continuity.summary}` : " Start a new session to continue your learning journey."}
                </p>
                <Badge variant="secondary">{continuity.mode === "quick" ? "Quick practice" : continuity.mode === "ask" ? "Ask mode" : "Daily session"}</Badge>
              </>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                No previous sessions yet. Start your first daily session to begin your Mandarin journey!
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
