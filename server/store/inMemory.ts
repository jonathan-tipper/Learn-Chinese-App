import { randomUUID } from "crypto";
import type {
  AgentRun,
  CharacterCard,
  GrammarPoint,
  GrammarPointSignal,
  LearningPlan,
  MemoryItem,
  MessageRecord,
  Profile,
  SessionRecord,
  SrsCard,
  SrsGrade,
  TutorStructuredResponse,
  VocabItem
} from "@/lib/types";
import { type PronunciationAttempt, deriveWeakPronunciationAreas, normalizePronunciationAttempt } from "@/lib/pronunciation";
import { repairLegacyCard } from "@/server/store/legacyCards";
import {
  activeDaysFromSessions,
  computeStreakDays,
  sessionMinutes
} from "@/server/store/sessionActivity";
import type { EndSessionOptions } from "@/server/store/contracts";
import { grammarPointIdentity } from "@/lib/grammar-points";
import { buildLearningEvent, type LearningEvent, type LearningEventInput } from "@/lib/learning-events";
import {
  deriveWeakTonePairRollups,
  formatWeakTonePairLabel,
  normalizeTonePracticeAttempt,
  type TonePracticeAttempt
} from "@/lib/tone-practice";
import {
  type SrsCardContext,
  buildAnswerSafeHints,
  buildCardTags,
  computeScheduling,
  formatReviewAnswer,
  isValidReviewItem,
  isMasteredCard,
  parseVocabItem,
  parseReviewItem,
  srsCardIdentity,
  vocabItemIdentity
} from "@/server/store/srs";

const now = () => new Date().toISOString();

/**
 * Next.js bundles every route separately, so plain module state would give each API route
 * its own copy of the store. Anchoring the maps on globalThis keeps one shared store per
 * process (dev server, tests, and the degraded mode used when a Supabase table is missing).
 */
type InMemoryState = {
  sessions: Map<string, SessionRecord>;
  messages: Map<string, MessageRecord[]>;
  memories: Map<string, MemoryItem[]>;
  srsCards: Map<string, SrsCard[]>;
  vocabItems: Map<string, VocabItem[]>;
  grammarPoints: Map<string, GrammarPoint[]>;
  profiles: Map<string, Profile>;
  agentRuns: AgentRun[];
  learningEvents: LearningEvent[];
  learningPlans: Map<string, LearningPlan[]>;
  characterCards: Map<string, CharacterCard>;
};

const STATE_KEY = Symbol.for("learn-chinese.in-memory-store");

function getState(): InMemoryState {
  const holder = globalThis as unknown as Record<symbol, InMemoryState | undefined>;
  if (!holder[STATE_KEY]) {
    holder[STATE_KEY] = {
      sessions: new Map(),
      messages: new Map(),
      memories: new Map(),
      srsCards: new Map(),
      vocabItems: new Map(),
      grammarPoints: new Map(),
      profiles: new Map(),
      agentRuns: [],
      learningEvents: [],
      learningPlans: new Map(),
      characterCards: new Map()
    };
  }
  return holder[STATE_KEY];
}

const state = getState();
const sessions = state.sessions;
const messages = state.messages;
const memories = state.memories;
const srsCards = state.srsCards;
const vocabItems = state.vocabItems;
const grammarPoints = state.grammarPoints;
const profiles = state.profiles;
const agentRuns = state.agentRuns;
const learningEvents = state.learningEvents;
const learningPlans = state.learningPlans;
const characterCards = state.characterCards;

export function resetInMemoryStore() {
  sessions.clear();
  messages.clear();
  memories.clear();
  srsCards.clear();
  vocabItems.clear();
  grammarPoints.clear();
  profiles.clear();
  agentRuns.length = 0;
  learningEvents.length = 0;
  learningPlans.clear();
  characterCards.clear();
}

export function saveProfile(profile: Profile) {
  profiles.set(profile.userId, profile);
  return profile;
}

export function getProfile(userId: string) {
  return profiles.get(userId) ?? null;
}

export function listProfilesWithReminders() {
  return Array.from(profiles.values()).filter((profile) => typeof profile.reminderHour === "number");
}

export function createSession(userId: string, mode: SessionRecord["mode"]) {
  const session: SessionRecord = { id: randomUUID(), userId, mode, startedAt: now(), metrics: {} };
  sessions.set(session.id, session);
  messages.set(session.id, []);
  return session;
}

export function getSessionForUser(userId: string, sessionId: string) {
  const current = sessions.get(sessionId);
  return current?.userId === userId ? current : null;
}

export function endSession(
  sessionId: string,
  durationSec: number,
  summary?: string,
  userId?: string,
  options: EndSessionOptions = {}
) {
  const current = sessions.get(sessionId);
  if (!current) return null;
  if (userId && current.userId !== userId) return null;
  const metrics = {
    ...(current.metrics ?? {}),
    durationSec,
    ...(options.autoClosed ? { autoClosed: true } : {}),
    ...(options.summaryGenerated ? { summaryGenerated: true } : {})
  };
  const updated = { ...current, endedAt: options.endedAt ?? now(), durationSec, summary, metrics };
  sessions.set(sessionId, updated);
  return updated;
}

export function listOpenSessions(userId: string) {
  return listSessionsByUser(userId).filter((session) => !session.endedAt);
}

export function recordTonePracticeAttempts(
  userId: string,
  sessionId: string,
  attempts: TonePracticeAttempt[]
) {
  const current = getSessionForUser(userId, sessionId);
  if (!current) return null;

  const normalized = attempts.map((attempt) => normalizeTonePracticeAttempt(attempt, sessionId));
  const metrics = {
    ...(current.metrics ?? {}),
    tonePracticeAttempts: [
      ...(current.metrics?.tonePracticeAttempts ?? []),
      ...normalized
    ]
  };
  const updated = { ...current, metrics, durationSec: metrics.durationSec };
  sessions.set(sessionId, updated);
  return normalized;
}

export function recordPronunciationAttempts(
  userId: string,
  sessionId: string,
  attempts: PronunciationAttempt[]
) {
  const current = getSessionForUser(userId, sessionId);
  if (!current) return null;

  const normalized = attempts.map((attempt) => normalizePronunciationAttempt(attempt, sessionId));
  const all = [...(current.metrics?.pronunciationAttempts ?? []), ...normalized];
  const metrics = { ...(current.metrics ?? {}), pronunciationAttempts: all, lastActivityAt: now() };
  sessions.set(sessionId, { ...current, metrics });
  return { recorded: normalized, all };
}

export function listSessionsByUser(userId: string) {
  return Array.from(sessions.values()).filter((s) => s.userId === userId);
}

export function getLastCompletedSession(userId: string) {
  const userSessions = listSessionsByUser(userId).filter((s) => s.endedAt);
  userSessions.sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""));
  return userSessions[0] ?? null;
}

export function appendMessage(sessionId: string, role: MessageRecord["role"], content: string) {
  const list = messages.get(sessionId) ?? [];
  const message: MessageRecord = { id: randomUUID(), sessionId, role, content, createdAt: now() };
  list.push(message);
  messages.set(sessionId, list);

  const session = sessions.get(sessionId);
  if (session) {
    const metrics = session.metrics ?? {};
    sessions.set(sessionId, {
      ...session,
      metrics: {
        ...metrics,
        messageCount: (metrics.messageCount ?? 0) + 1,
        lastActivityAt: message.createdAt
      }
    });
  }
  return message;
}

export function listSessionMessages(sessionId: string) {
  return messages.get(sessionId) ?? [];
}

export function listSessionMessagesForUser(userId: string, sessionId: string) {
  return getSessionForUser(userId, sessionId) ? listSessionMessages(sessionId) : [];
}

export function listMemories(userId: string) {
  return (memories.get(userId) ?? []).filter((m) => !m.deletedAt);
}

export function addMemory(userId: string, key: string, value: string, type: MemoryItem["type"] = "preference") {
  const list = memories.get(userId) ?? [];
  const item: MemoryItem = {
    id: randomUUID(),
    userId,
    type,
    key,
    value,
    confidence: 0.7,
    createdAt: now()
  };
  list.push(item);
  memories.set(userId, list);
  return item;
}

export function deleteMemory(userId: string, memoryId: string) {
  const list = memories.get(userId) ?? [];
  const idx = list.findIndex((m) => m.id === memoryId && !m.deletedAt);
  if (idx < 0) return false;
  list[idx] = { ...list[idx], deletedAt: now() };
  memories.set(userId, list);
  return true;
}

export function addSrsCards(userId: string, items: string[], context: SrsCardContext = {}) {
  const list = srsCards.get(userId) ?? [];
  const seen = new Set(list.map((card) => srsCardIdentity(card.prompt, card.answer)));
  const created: SrsCard[] = [];

  for (const item of items) {
    const parsed = parseReviewItem(item);
    if (!isValidReviewItem(parsed)) continue;

    const answer = formatReviewAnswer(parsed);
    const identity = srsCardIdentity(parsed.chinese, answer);
    if (seen.has(identity)) continue;
    seen.add(identity);

    created.push({
      id: randomUUID(),
      userId,
      prompt: parsed.chinese,
      answer,
      hints: buildAnswerSafeHints(parsed.chinese, context),
      tags: buildCardTags(context),
      ease: 2.5,
      interval: 1,
      nextDueAt: now()
    });
  }

  srsCards.set(userId, [...list, ...created]);
  return created;
}

export function getAllCards(userId: string) {
  return (srsCards.get(userId) ?? []).map((card) => repairLegacyCard(card).card);
}

export function addVocabItems(userId: string, items: string[], sourceSessionId?: string) {
  const list = vocabItems.get(userId) ?? [];
  const upserted: VocabItem[] = [];
  const seenInput = new Set<string>();

  for (const item of items) {
    const parsed = parseVocabItem(item);
    if (!parsed) continue;

    const identity = vocabItemIdentity(parsed.hanzi, parsed.pinyin);
    if (seenInput.has(identity)) continue;
    seenInput.add(identity);

    const existingIndex = list.findIndex((current) => vocabItemIdentity(current.hanzi, current.pinyin) === identity);
    if (existingIndex >= 0) {
      const existing = list[existingIndex];
      const updated = {
        ...existing,
        pinyin: parsed.pinyin ?? existing.pinyin,
        english: parsed.english ?? existing.english,
        sourceSessionId: sourceSessionId ?? existing.sourceSessionId
      };
      list[existingIndex] = updated;
      upserted.push(updated);
      continue;
    }

    const created: VocabItem = {
      id: randomUUID(),
      userId,
      hanzi: parsed.hanzi,
      pinyin: parsed.pinyin,
      english: parsed.english,
      tags: ["auto-generated"],
      sourceSessionId,
      createdAt: now()
    };
    list.push(created);
    upserted.push(created);
  }

  vocabItems.set(userId, list);
  return upserted;
}

export function listVocabItems(userId: string) {
  return vocabItems.get(userId) ?? [];
}

export function addGrammarPoints(userId: string, signals: GrammarPointSignal[]) {
  const list = grammarPoints.get(userId) ?? [];
  const upserted: GrammarPoint[] = [];
  const seenInput = new Set<string>();

  for (const signal of signals) {
    const identity = grammarPointIdentity(signal.title);
    if (seenInput.has(identity)) continue;
    seenInput.add(identity);

    const existingIndex = list.findIndex((current) => grammarPointIdentity(current.title) === identity);
    if (existingIndex >= 0) {
      const updated = {
        ...list[existingIndex],
        explanation: signal.explanation,
        examples: signal.examples
      };
      list[existingIndex] = updated;
      upserted.push(updated);
      continue;
    }

    const created: GrammarPoint = {
      id: randomUUID(),
      userId,
      title: signal.title,
      explanation: signal.explanation,
      examples: signal.examples,
      createdAt: now()
    };
    list.push(created);
    upserted.push(created);
  }

  grammarPoints.set(userId, list);
  return upserted;
}

export function listGrammarPoints(userId: string) {
  return grammarPoints.get(userId) ?? [];
}

export function getDueCards(userId: string, limit = 10) {
  const current = Date.now();
  return getAllCards(userId)
    .filter((c) => new Date(c.nextDueAt).getTime() <= current)
    .slice(0, limit);
}

export function saveLearningPlan(plan: LearningPlan) {
  const list = (learningPlans.get(plan.userId) ?? []).filter((existing) => existing.id !== plan.id);
  list.push(plan);
  learningPlans.set(plan.userId, list);
  return plan;
}

export function getLatestLearningPlan(userId: string) {
  const list = learningPlans.get(userId) ?? [];
  if (!list.length) return null;
  return [...list].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
}

export function updateLearningPlan(plan: LearningPlan) {
  return saveLearningPlan(plan);
}

export function getCachedCharacterCard(entry: string) {
  return characterCards.get(entry) ?? null;
}

export function saveCharacterCard(card: CharacterCard) {
  characterCards.set(card.entry, card);
  return card;
}

export function gradeCard(userId: string, cardId: string, grade: SrsGrade) {
  const list = srsCards.get(userId) ?? [];
  const idx = list.findIndex((c) => c.id === cardId);
  if (idx < 0) return null;

  const current = list[idx];
  const { interval, ease, nextDueAt } = computeScheduling(current.interval, current.ease, grade);

  const updated = { ...current, interval, ease, nextDueAt, lastResult: grade };
  list[idx] = updated;
  srsCards.set(userId, list);
  return updated;
}

export function logAgentRun(run: Omit<AgentRun, "id" | "createdAt">) {
  agentRuns.push({ ...run, id: randomUUID(), createdAt: now() });
}

export function getSessionAgentUsage(userId: string, sessionId: string) {
  return agentRuns
    .filter((run) => run.userId === userId && run.sessionId === sessionId)
    .reduce(
      (total, run) => ({
        tokens: total.tokens + run.tokens,
        costEstimate: total.costEstimate + run.costEstimate
      }),
      { tokens: 0, costEstimate: 0 }
    );
}

export function recordLearningEvent(input: LearningEventInput) {
  if (input.sessionId && input.name !== "review_completed") {
    const existing = learningEvents.find(
      (event) => event.sessionId === input.sessionId && event.name === input.name
    );
    if (existing) return existing;
  }
  const event = buildLearningEvent(input);
  learningEvents.push(event);
  return event;
}

export function listLearningEvents(userId: string) {
  return learningEvents.filter((event) => event.userId === userId);
}

export function computeProgressSummary(userId: string) {
  const userSessions = listSessionsByUser(userId);
  const cards = getAllCards(userId);
  const due = getDueCards(userId, cards.length);
  return summarizeProgress(userSessions, cards, due.length);
}

/** Shared progress math for both store implementations. */
export function summarizeProgress(userSessions: SessionRecord[], cards: SrsCard[], dueCount: number) {
  const activeSessions = userSessions.filter(
    (s) => s.endedAt
      || (s.metrics?.messageCount ?? 0) > 0
      || (s.metrics?.tonePracticeAttempts?.length ?? 0) > 0
      || (s.metrics?.pronunciationAttempts?.length ?? 0) > 0
  );
  const totalMinutes = activeSessions.reduce((acc, s) => acc + sessionMinutes(s), 0);
  const weekStartMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklySessions = activeSessions.filter((s) => {
    const completedAt = s.endedAt ?? s.metrics?.lastActivityAt ?? s.startedAt;
    return new Date(completedAt).getTime() > weekStartMs;
  });
  const weeklyMinutes = weeklySessions.reduce((acc, s) => acc + sessionMinutes(s), 0);
  const streakDays = computeStreakDays(activeDaysFromSessions(userSessions));

  const strugglingCards = cards.filter(
    (c) => c.ease < 2.0 || c.lastResult === "again" || c.lastResult === "hard"
  );
  const weakAreaSet = new Set<string>();
  const tonePracticeAttempts = userSessions.flatMap((session) => session.metrics?.tonePracticeAttempts ?? []);
  for (const rollup of deriveWeakTonePairRollups(tonePracticeAttempts)) {
    weakAreaSet.add(formatWeakTonePairLabel(rollup));
  }
  const pronunciationAttempts = userSessions.flatMap((session) => session.metrics?.pronunciationAttempts ?? []);
  for (const label of deriveWeakPronunciationAreas(pronunciationAttempts)) {
    weakAreaSet.add(label);
  }
  for (const card of strugglingCards) {
    for (const tag of card.tags) {
      if (tag && tag !== "auto-generated") weakAreaSet.add(tag);
    }
    if (/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(card.prompt) && card.lastResult === "again") {
      weakAreaSet.add("tone pairs");
    }
  }
  const weakAreas = Array.from(weakAreaSet).slice(0, 4);
  if (weakAreas.length === 0 && cards.length > 0 && strugglingCards.length / cards.length > 0.2) {
    weakAreas.push("recently introduced vocabulary");
  }

  const vocabMastered = cards.filter(isMasteredCard).length;

  return {
    totalSessions: activeSessions.length,
    totalMinutes,
    weeklySessions: weeklySessions.length,
    weeklyMinutes,
    streakDays,
    vocabLearning: cards.length - vocabMastered,
    vocabMastered,
    dueCards: dueCount,
    weakAreas
  };
}

export function synthesizeTutorResponse(message: string): TutorStructuredResponse {
  return {
    keyPoints: ["Use concise sentence order", "Prioritize high-frequency vocabulary"],
    examples: [
      "我想点一杯咖啡。 (I’d like to order a coffee.)",
      "请问这个怎么说？ (How do you say this?)"
    ],
    microExercise: `Rewrite this with 今天 (today): ${message}`,
    suggestedReviewItems: ["我想点一杯咖啡", "请问这个怎么说"],
    answer: "Great prompt. Let’s practice this in a realistic daily context with pinyin and hanzi."
  };
}
