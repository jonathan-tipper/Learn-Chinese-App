import { BookMarked, Lightbulb, Shapes } from "lucide-react";
import type { CharacterCard as CharacterCardData } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function CharacterCardDetails({ card }: { card: CharacterCardData }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-br from-crimson/10 via-card to-jade/5 p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Studied character
            </p>
            <h2 className="hanzi break-words text-6xl leading-none sm:text-7xl">{card.hanzi}</h2>
          </div>
          <div className="space-y-1 sm:text-right">
            <p className="text-lg font-semibold">{card.pinyin ?? "Pinyin not available"}</p>
            <p className="text-sm text-muted-foreground">{card.english ?? "Meaning not available"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {card.sources.includes("review") && <Badge variant="secondary">In review</Badge>}
          {card.sources.includes("vocabulary") && <Badge variant="secondary">Vocabulary</Badge>}
          {card.learnedInSession && <Badge variant="jade">Saved from a coach session</Badge>}
        </div>
      </CardHeader>

      <CardContent className="grid gap-6 p-5 sm:p-7 lg:grid-cols-2">
        <section aria-labelledby={`context-${card.id}`} className="space-y-3 lg:col-span-2">
          <div className="flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-jade" aria-hidden="true" />
            <h3 id={`context-${card.id}`} className="text-sm font-semibold">Learning context</h3>
          </div>
          {card.examples.length > 0 ? (
            <ul className="space-y-2">
              {card.examples.map((example) => (
                <li key={example} className="rounded-lg border bg-muted/35 px-4 py-3">
                  <span className="hanzi break-words text-lg">{example}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
              No source example is stored for this item yet.
            </p>
          )}
        </section>

        <section aria-labelledby={`radical-${card.id}`} className="space-y-3">
          <div className="flex items-center gap-2">
            <Shapes className="h-4 w-4 text-crimson" aria-hidden="true" />
            <h3 id={`radical-${card.id}`} className="text-sm font-semibold">Radical</h3>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {card.radical ?? "Radical details aren’t available yet."}
          </p>
        </section>

        <section aria-labelledby={`mnemonic-${card.id}`} className="space-y-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <h3 id={`mnemonic-${card.id}`} className="text-sm font-semibold">Mnemonic</h3>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {card.mnemonic ?? "Mnemonic support isn’t available yet."}
          </p>
        </section>

        <section aria-labelledby={`words-${card.id}`} className="space-y-3 lg:col-span-2">
          <h3 id={`words-${card.id}`} className="text-sm font-semibold">Common words</h3>
          {card.commonWords.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {card.commonWords.map((word) => <li key={word}><Badge variant="outline">{word}</Badge></li>)}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Common words aren’t available yet.</p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
