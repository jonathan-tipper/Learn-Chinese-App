import { randomUUID } from "crypto";
import type {
  AgentRun,
  MemoryItem,
  MessageRecord,
  Profile,
  SessionRecord,
  SrsCard,
  SrsGrade,
  TutorStructuredResponse
} from "@/lib/types";

const now = () => new Date().toISOString();

const sessions = new Map<string, SessionRecord>();
const messages = new Map<string, MessageRecord[]>();
const memories = new Map<string, MemoryItem[]>();
const srsCards = new Map<string, SrsCard[]>();
const profiles = new Map<string, Profile>();
const agentRuns: AgentRun[] = [];

export function saveProfile(profile: Profile) {
  profiles.set(profile.userId, profile);
  return profile;
}

export function getProfile(userId: string) {
  return profiles.get(userId) ?? null;
}

export function createSession(userId: string, mode: SessionRecord["mode"]) {
  const session: SessionRecord = { id: randomUUID(), userId, mode, startedAt: now() };
  sessions.set(session.id, session);
  messages.set(session.id, []);
  return session;
}

export function endSession(sessionId: string, durationSec: number, summary?: string) {
  const current = sessions.get(sessionId);
  if (!current) return null;
  const updated = { ...current, endedAt: now(), durationSec, summary };
  sessions.set(sessionId, updated);
  return updated;
}

export function listSessionsByUser(userId: string) {
  return Array.from(sessions.values()).filter((s) => s.userId === userId);
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
  const created = items.map<SrsCard>((item) => ({
    id: randomUUID(),
    userId,
    prompt: `Translate or use: ${item}`,
    answer: item,
    hints: ["Recall context from your last session"],
    tags: ["auto-generated"],
    ease: 2.5,
    interval: 1,
    nextDueAt: now()
  }));
  srsCards.set(userId, [...list, ...created]);
  return created;
}

export function getAllCards(userId: string) {
  return srsCards.get(userId) ?? [];
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

  const gradeMultiplier: Record<SrsGrade, number> = {
    again: 0.5,
    hard: 0.8,
    good: 1.25,
    easy: 1.6
  };

  const current = list[idx];
  const interval = Math.max(1, Math.round(current.interval * gradeMultiplier[grade]));
  const ease = Math.max(1.3, Number((current.ease + (grade === "easy" ? 0.15 : grade === "again" ? -0.2 : 0)).toFixed(2)));
  const nextDue = new Date(Date.now() + interval * 24 * 60 * 60 * 1000).toISOString();

  const updated = { ...current, interval, ease, nextDueAt: nextDue, lastResult: grade };
  list[idx] = updated;
  srsCards.set(userId, list);
  return updated;
}

export function logAgentRun(run: Omit<AgentRun, "id" | "createdAt">) {
  agentRuns.push({ ...run, id: randomUUID(), createdAt: now() });
}

export function computeProgressSummary(userId: string) {
  const userSessions = listSessionsByUser(userId);
  const cards = getAllCards(userId);
  const due = getDueCards(userId, cards.length);
  const totalMinutes = userSessions.reduce((acc, s) => acc + Math.round((s.durationSec ?? 0) / 60), 0);
  const completedDays = new Set(
    userSessions
      .filter((s) => s.endedAt)
      .map((s) => (s.endedAt ?? s.startedAt).slice(0, 10))
  );

  return {
    totalSessions: userSessions.length,
    totalMinutes,
    streakDays: completedDays.size,
    vocabLearning: cards.length,
    dueCards: due.length,
    weakAreas: ["measure words", "tone pairs"]
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
