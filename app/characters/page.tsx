"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, Loader2, RefreshCw, Search, Sparkles, Type } from "lucide-react";
import { authedFetch } from "@/lib/authed-fetch";
import type { CharacterCard, StudiedEntry } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CharacterCardView } from "@/components/character-card-view";
import { cn } from "@/lib/utils";

const CJK_RE = /^[一-鿿㐀-䶿]{1,4}$/;

function CharactersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selected = searchParams.get("entry")?.trim() ?? "";

  const [entries, setEntries] = useState<StudiedEntry[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [card, setCard] = useState<CharacterCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardError, setCardError] = useState("");
  const [ttsId, setTtsId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void (async () => {
      setListLoading(true);
      try {
        const response = await authedFetch("/api/characters");
        if (response.ok) {
          const data = await response.json() as { entries: StudiedEntry[] };
          setEntries(data.entries ?? []);
        }
      } finally {
        setListLoading(false);
      }
    })();
  }, []);

  const loadCard = useCallback(async (entry: string, refresh = false) => {
    setCardLoading(true);
    setCardError("");
    try {
      const meta = entries.find((item) => item.entry === entry);
      const params = new URLSearchParams();
      if (refresh) params.set("refresh", "1");
      if (meta?.pinyin) params.set("pinyin", meta.pinyin);
      if (meta?.english) params.set("english", meta.english);
      const suffix = params.toString() ? `?${params}` : "";
      const response = await authedFetch(`/api/characters/${encodeURIComponent(entry)}${suffix}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCard(null);
        setCardError(data.error ?? "Could not build this character card.");
        return;
      }
      setCard(data.card as CharacterCard);
    } catch {
      setCard(null);
      setCardError("Could not reach the character service. Check your connection and try again.");
    } finally {
      setCardLoading(false);
    }
  }, [entries]);

  useEffect(() => {
    if (!selected) {
      setCard(null);
      return;
    }
    if (!CJK_RE.test(selected)) {
      setCardError("Character cards are available for 1 to 4 Chinese characters.");
      return;
    }
    void loadCard(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function open(entry: string) {
    router.push(`/characters?entry=${encodeURIComponent(entry)}`);
  }

  async function playTts(id: string, text: string) {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setTtsId(id);
    try {
      const response = await authedFetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: "zh", speed: 0.85 })
      });
      if (!response.ok) return;
      const data = await response.json() as { audioBase64?: string };
      if (!data.audioBase64) return;
      const audio = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
      audioRef.current = audio;
      await audio.play();
    } catch {
      // audio is optional
    } finally {
      setTtsId(null);
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((item) =>
      item.entry.includes(needle)
      || item.pinyin?.toLowerCase().includes(needle)
      || item.english?.toLowerCase().includes(needle)
    );
  }, [entries, query]);

  const canLookupQuery = CJK_RE.test(query.trim()) && !entries.some((item) => item.entry === query.trim());

  if (selected) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/characters">
              <ArrowLeft className="h-4 w-4" />
              All characters
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadCard(selected, true)} disabled={cardLoading}>
              <RefreshCw className={cn("h-4 w-4", cardLoading && "animate-spin")} />
              Regenerate
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/review">
                <BookOpen className="h-4 w-4" />
                Review
              </Link>
            </Button>
          </div>
        </div>

        {cardLoading && !card ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <span className="hanzi text-6xl text-foreground/20">{selected}</span>
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Building the card: radicals, mnemonic, common words…</p>
            </CardContent>
          </Card>
        ) : cardError ? (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">{cardError}</CardContent>
          </Card>
        ) : card ? (
          <CharacterCardView card={card} onPlay={playTts} playingId={ttsId} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="space-y-1">
        <Badge variant="secondary" className="gap-1 text-xs">
          <Type className="h-3 w-3" />
          Character library
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight">Characters you&apos;ve met</h1>
        <p className="text-sm text-muted-foreground">
          Every hanzi from your sessions and review cards. Open one for radicals, a mnemonic, common words and an example.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && CJK_RE.test(query.trim())) open(query.trim());
            }}
            placeholder="Filter by hanzi, pinyin or meaning — or type any character to look it up"
            className="pl-9"
          />
        </div>
        {canLookupQuery && (
          <Button onClick={() => open(query.trim())}>
            <Sparkles className="h-4 w-4" />
            Look up {query.trim()}
          </Button>
        )}
      </div>

      {listLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse space-y-2">
                  <div className="h-10 w-10 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              {entries.length === 0
                ? "No characters yet. Chat with your coach and the words you learn will appear here."
                : "Nothing matches that filter."}
            </p>
            {entries.length === 0 && (
              <Button asChild size="sm" variant="outline">
                <Link href="/chat">Start a session</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((item) => {
            const struggling = item.lastResult === "again" || item.lastResult === "hard";
            return (
              <button
                key={item.entry}
                type="button"
                onClick={() => open(item.entry)}
                className={cn(
                  "rounded-xl border bg-card p-4 text-left transition-all hover:border-foreground/30 hover:shadow-sm",
                  struggling && "border-amber-300/70 dark:border-amber-800"
                )}
              >
                <span className="hanzi block text-3xl leading-none">{item.entry}</span>
                <span className="mt-2 block text-sm font-medium truncate">{item.pinyin ?? "—"}</span>
                <span className="block text-xs text-muted-foreground truncate">{item.english ?? "tap to look up"}</span>
                {struggling && (
                  <Badge variant="amber" className="mt-2 text-[10px]">needs work</Badge>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CharactersPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
      <CharactersPageContent />
    </Suspense>
  );
}
