"use client";

import { Loader2, Volume2 } from "lucide-react";
import type { CharacterCard } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type PlayHandler = (id: string, text: string) => void;

function PlayButton({
  id,
  text,
  onPlay,
  playingId
}: {
  id: string;
  text: string;
  onPlay?: PlayHandler;
  playingId?: string | null;
}) {
  if (!onPlay) return null;
  const loading = playingId === id;
  return (
    <button
      type="button"
      onClick={() => onPlay(id, text)}
      disabled={loading}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      title="Play audio"
      aria-label={`Play ${text}`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
    </button>
  );
}

export function CharacterCardView({
  card,
  onPlay,
  playingId
}: {
  card: CharacterCard;
  onPlay?: PlayHandler;
  playingId?: string | null;
}) {
  return (
    <div className="space-y-4" data-testid="character-card">
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:items-center sm:text-left sm:gap-6">
            <span className="hanzi text-7xl leading-none">{card.entry}</span>
            <div className="space-y-1 min-w-0">
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <p className="text-2xl font-semibold">{card.pinyin}</p>
                <PlayButton id="entry" text={card.entry} onPlay={onPlay} playingId={playingId} />
              </div>
              <p className="text-base text-muted-foreground">{card.meaning}</p>
              {card.usageTip && <p className="text-sm text-foreground/80 leading-relaxed">{card.usageTip}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className={card.characters.length > 1 ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
        {card.characters.map((character) => (
          <Card key={character.hanzi}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="hanzi text-4xl leading-none">{character.hanzi}</span>
                  <div>
                    <p className="font-semibold">{character.pinyin}</p>
                    <p className="text-sm text-muted-foreground">{character.meaning}</p>
                  </div>
                </div>
                {character.strokeCount ? (
                  <Badge variant="secondary" className="text-[11px] shrink-0">{character.strokeCount} strokes</Badge>
                ) : null}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Radical</span>
                  <Badge variant="outline" className="gap-1">
                    <span className="hanzi">{character.radical}</span>
                    <span className="text-muted-foreground">{character.radicalMeaning}</span>
                  </Badge>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Components</p>
                  <p className="leading-relaxed">{character.components}</p>
                </div>
                <div className="rounded-lg border border-jade/20 bg-jade/5 px-3 py-2 dark:bg-jade/10">
                  <p className="text-xs font-semibold uppercase tracking-wide text-jade mb-0.5">Mnemonic</p>
                  <p className="leading-relaxed">{character.mnemonic}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {card.commonWords.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Common words</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {card.commonWords.map((word, index) => (
                <li key={`${word.hanzi}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
                  <div className="min-w-0">
                    <p className="hanzi text-lg leading-tight">{word.hanzi}</p>
                    <p className="text-xs text-muted-foreground">{word.pinyin} · {word.english}</p>
                  </div>
                  <PlayButton id={`word-${index}`} text={word.hanzi} onPlay={onPlay} playingId={playingId} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In a sentence</p>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <p className="hanzi text-xl leading-snug">{card.exampleSentence.hanzi}</p>
              <p className="text-sm text-muted-foreground">{card.exampleSentence.pinyin}</p>
              <p className="text-sm">{card.exampleSentence.english}</p>
            </div>
            <PlayButton id="sentence" text={card.exampleSentence.hanzi} onPlay={onPlay} playingId={playingId} />
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground">
        Generated by {card.generatedBy} and cached. Radical and etymology notes are AI-written; verify anything you rely on.
      </p>
    </div>
  );
}
