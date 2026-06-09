"use client";

import { useEffect, useState } from "react";
import { Brain, RefreshCw, Trash2, Loader2, BookOpen, Target, Star, Tag } from "lucide-react";
import { authedFetch } from "@/lib/authed-fetch";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Memory = { id: string; key: string; value: string; type: string };

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; variant: BadgeProps["variant"] }> = {
  goal:        { label: "Goal",       icon: Target,   variant: "goal" },
  vocab:       { label: "Vocabulary", icon: BookOpen, variant: "vocab" },
  topic:       { label: "Topic",      icon: Tag,      variant: "topic" },
  preference:  { label: "Preference", icon: Star,     variant: "preference" }
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? { label: type, icon: Brain, variant: "secondary" as const };
}

function MemoryCard({ memory, onForget }: { memory: Memory; onForget: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const config = getTypeConfig(memory.type);
  const Icon = config.icon;

  return (
    <Card className="group transition-all hover:border-foreground/20 hover:shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted mt-0.5">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground truncate">{memory.key}</p>
                <Badge variant={config.variant} className="text-[10px] shrink-0">{config.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{memory.value}</p>
            </div>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Forget this memory?</DialogTitle>
                <DialogDescription>
                  Your coach will no longer remember &ldquo;<strong>{memory.key}</strong>&rdquo;. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    onForget(memory.id);
                    setOpen(false);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Forget
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    setIsLoading(true);
    const response = await authedFetch("/api/memory/list");
    setIsLoading(false);
    if (!response.ok) {
      setMemories([]);
      return;
    }
    const data = await response.json();
    setMemories(data.memories ?? []);
  }

  async function remove(memoryId: string) {
    const previous = memories;
    setMemories((prev) => prev.filter((m) => m.id !== memoryId));
    const response = await authedFetch("/api/memory/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryId })
    });
    if (!response.ok) {
      setMemories(previous);
      return;
    }
    refresh();
  }

  useEffect(() => {
    refresh();
  }, []);

  // Group memories by type
  const grouped = memories.reduce<Record<string, Memory[]>>((acc, m) => {
    const key = m.type || "other";
    (acc[key] ??= []).push(m);
    return acc;
  }, {});

  const typeOrder = ["goal", "preference", "topic", "vocab"];
  const sortedTypes = [
    ...typeOrder.filter((t) => grouped[t]),
    ...Object.keys(grouped).filter((t) => !typeOrder.includes(t))
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Memory</h1>
          <p className="text-sm text-muted-foreground">
            What your coach remembers about you. Hover a card to forget it.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="animate-pulse flex gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="h-3 w-48 rounded bg-muted" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && memories.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center text-center py-12 space-y-3">
            <Brain className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-foreground">No memories yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Chat with your coach and say things like &ldquo;Remember that I prefer formal speech&rdquo; to start building your profile.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grouped memory cards */}
      {!isLoading && memories.length > 0 && (
        <div className="space-y-6">
          {/* Summary badges */}
          <div className="flex flex-wrap gap-2">
            {sortedTypes.map((type) => {
              const cfg = getTypeConfig(type);
              return (
                <Badge key={type} variant={cfg.variant} className="gap-1">
                  {grouped[type].length} {cfg.label}
                </Badge>
              );
            })}
          </div>

          {sortedTypes.map((type) => {
            const cfg = getTypeConfig(type);
            return (
              <div key={type} className="space-y-2">
                <h2 className={cn(
                  "text-xs font-semibold uppercase tracking-widest",
                  "text-muted-foreground"
                )}>
                  {cfg.label} · {grouped[type].length}
                </h2>
                <div className="grid gap-2">
                  {grouped[type].map((memory) => (
                    <MemoryCard key={memory.id} memory={memory} onForget={remove} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* How it works hint */}
      <Card className="border-dashed bg-transparent">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>Tip:</strong> In the chat, you can say &ldquo;remember that I work in tech&rdquo; or &ldquo;forget that I like spicy food&rdquo; to manage what your coach knows about you.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
