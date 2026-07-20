import { randomUUID } from "crypto";
import type {
  AgentRun,
  GrammarPoint,
  GrammarPointSignal,
  MemoryItem,
  MessageRecord,
  Profile,
  SessionRecord,
  SrsCard,
  SrsGrade,
  TutorStructuredResponse,
  VocabItem
} from "@/lib/types";
import { grammarPointIdentity } from "@/lib/grammar-points";
import { buildLearningEvent, type LearningEvent, type LearningEventInput } from "@/lib/learning-events";
import {
  deriveWeakTonePairRollups,
  formatWeakTonePairLabel,
  normalizeTonePracticeAttempt,
  type TonePracticeAttempt
} from "@/lib/tone-practice";
import {
  computeScheduling,
  formatReviewAnswer,
  isValidReviewItem,
  parseVocabItem,
  parseReviewItem,
  srsCardIdentity,
  vocabItemIdentity
} from "@/server/store/srs";

const now = () => new Date().toISOString();

const sessions = new Map<string, SessionRecord>();
const messages = new Map<string, MessageRecord[]>();
const memories = new Map<string, MemoryItem[]>();
const srsCards = new Map<string, SrsCard[]>();
const vocabItems = new Map<string, VocabItem[]>();
const grammarPoints = new Map<string, GrammarPoint[]>();
const profiles = new Map<string, Profile>();
const agentRuns: AgentRun[] = [];
const learningEvents: LearningEvent[] = [];

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
}

export function saveProfile(profile: Profile) {
  profiles.set(profile.userId, profile);
  return profile;
}

export function getProfile(userId: string) {
  return profiles.get(userId) ?? null;
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

export function endSession(sessionId: string, durationSec: number, summary?: string, userId?: string) {
  const current = sessions.get(sessionId);
  if (!current) return null;
  if (userId && current.userId !== userId) return null;
  const metrics = { ...(current.metrics ?? {}), durationSec };
  const updated = { ...current, endedAt: now(), durationSec, summary, metrics };
  sessions.set(sessionId, updated);
  return updated;
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

export function addSrsCards(userId: string, items: string[]) {
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
      hints: ["Recall context from your last session"],
      tags: ["auto-generated"],
      ease: 2.5,
      interval: 1,
      nextDueAt: now()
    });
  }

  srsCards.set(userId, [...list, ...created]);
  return created;
}

export function getAllCards(userId: string) {
  return srsCards.get(userId) ?? [];
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
  return (srsCards.get(userId) ?? [])
    .filter((c) => new Date(c.nextDueAt).getTime() <= current)
    .slice(0, limit);
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
  const totalMinutes = userSessions.reduce((acc, s) => acc + Math.round((s.durationSec ?? 0) / 60), 0);
  const weekStartMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklySessions = userSessions.filter((s) => {
    const completedAt = s.endedAt ?? s.startedAt;
    return Boolean(s.endedAt) && new Date(completedAt).getTime() > weekStartMs;
  });
  const weeklyMinutes = weeklySessions.reduce((acc, s) => acc + Math.round((s.durationSec ?? 0) / 60), 0);
  const completedDays = new Set(
    userSessions
      .filter((s) => s.endedAt)
      .map((s) => (s.endedAt ?? s.startedAt).slice(0, 10))
  );
  let streakDays = 0;
  const cursor = new Date(new Date().toISOString().slice(0, 10));
  while (completedDays.has(cursor.toISOString().slice(0, 10))) {
    streakDays++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const strugglingCards = cards.filter(
    (c) => c.ease < 2.0 || c.lastResult === "again" || c.lastResult === "hard"
  );
  const weakAreaSet = new Set<string>();
  const tonePracticeAttempts = userSessions.flatMap((session) => session.metrics?.tonePracticeAttempts ?? []);
  for (const rollup of deriveWeakTonePairRollups(tonePracticeAttempts)) {
    weakAreaSet.add(formatWeakTonePairLabel(rollup));
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

  return {
    totalSessions: userSessions.length,
    totalMinutes,
    weeklySessions: weeklySessions.length,
    weeklyMinutes,
    streakDays,
    vocabLearning: cards.length,
    dueCards: due.length,
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
