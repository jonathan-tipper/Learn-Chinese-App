"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, ChevronRight, Languages, Loader2, RefreshCw } from "lucide-react";
import { authedFetch } from "@/lib/authed-fetch";
import type { CharacterCard } from "@/lib/types";
import { CharacterCardDetails } from "@/components/character-card-details";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function CharactersPage() {
  const [cards, setCards] = useState<CharacterCard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadCards() {
    setIsLoading(true);
    setError("");

    try {
      const response = await authedFetch("/api/characters");
      if (!response.ok) {
        setCards([]);
        setSelectedId(null);
        setError("We couldn’t load your studied characters. Try again in a moment.");
        return;
      }

      const data = await response.json() as { cards?: CharacterCard[] };
      const loaded = data.cards ?? [];
      const requestedHanzi = new URLSearchParams(window.location.search).get("hanzi")?.trim();
      const requested = requestedHanzi
        ? loaded.find((card) => card.hanzi.trim() === requestedHanzi)
        : undefined;

      setCards(loaded);
      setSelectedId((current) => {
        if (requested) return requested.id;
        if (current && loaded.some((card) => card.id === current)) return current;
        return loaded[0]?.id ?? null;
      });
    } catch {
      setCards([]);
      setSelectedId(null);
      setError("You appear to be offline. Reconnect to load your studied characters.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCards();
  }, []);

  function selectCard(card: CharacterCard) {
    setSelectedId(card.id);
    const url = new URL(window.location.href);
    url.searchParams.set("hanzi", card.hanzi);
    window.history.replaceState(null, "", url);
  }

  const selectedCard = cards.find((card) => card.id === selectedId) ?? cards[0];

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-crimson">
            <Languages className="h-4 w-4" aria-hidden="true" />
            Character library
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Your studied characters</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Revisit hanzi from your vocabulary and review cards. Only details already stored in your learning data are shown.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadCards()} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </header>

      {isLoading ? (
        <Card aria-live="polite">
          <CardContent className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Loading your character library…
          </CardContent>
        </Card>
      ) : error ? (
        <Card role="alert" className="border-destructive/30">
          <CardContent className="flex min-h-64 flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="font-semibold">Character library unavailable</h2>
              <p className="max-w-md text-sm text-muted-foreground">{error}</p>
            </div>
            <Button variant="outline" onClick={() => void loadCards()}>Try again</Button>
          </CardContent>
        </Card>
      ) : cards.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-72 flex-col items-center justify-center gap-5 p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-crimson/10 text-crimson">
              <span className="hanzi text-3xl">汉</span>
            </div>
            <div className="max-w-md space-y-2">
              <h2 className="text-lg font-semibold">Your character library is ready to grow</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Complete a coach session and save Chinese vocabulary to review. Studied hanzi will appear here automatically.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild><Link href="/chat">Start a coach session</Link></Button>
              <Button variant="outline" asChild><Link href="/review">Open quick practice</Link></Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:items-start">
          <aside className="space-y-3 lg:sticky lg:top-24">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Studied items</h2>
              <span className="text-xs text-muted-foreground">{cards.length} total</span>
            </div>
            <div aria-label="Studied character list" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {cards.map((card) => {
                const selected = card.id === selectedCard?.id;
                return (
                  <button
                    key={card.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectCard(card)}
                    className={cn(
                      "group flex min-w-0 items-center justify-between gap-2 rounded-lg border bg-card px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      selected ? "border-crimson/40 bg-crimson/5" : "hover:border-foreground/20 hover:bg-muted/40"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="hanzi block truncate text-xl leading-tight">{card.hanzi}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {card.pinyin ?? card.english ?? "Details pending"}
                      </span>
                    </span>
                    <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground", selected && "text-crimson")} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0">
            {selectedCard && <CharacterCardDetails card={selectedCard} />}
          </div>
        </div>
      )}

      <Card className="bg-muted/30">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-jade" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Review scheduling and grading still live in Quick Practice; this library is for inspection only.
            </p>
          </div>
          <Button size="sm" variant="outline" asChild><Link href="/review">Go to review</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}
