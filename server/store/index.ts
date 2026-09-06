import { isSupabaseStoreEnabled } from "@/lib/env";
import type { TonePracticeAttempt } from "@/lib/tone-practice";
import type {
  AgentRun,
  CharacterCard,
  GrammarPointSignal,
  LearningPlan,
  MemoryItem,
  MessageRecord,
  Profile,
  SessionRecord,
  SrsGrade,
  StudiedEntry
} from "@/lib/types";
import type { LearningEventInput } from "@/lib/learning-events";
import type { EndSessionOptions } from "@/server/store/contracts";
import { isMissingRelationError, warnOnceMissingRelation } from "@/server/store/errors";
import type { SrsCardContext } from "@/server/store/srs";
import { synthesizeTutorResponse } from "@/server/store/inMemory";
import * as inMemory from "@/server/store/inMemory";
import * as supabase from "@/server/store/supabase";

function shouldUseSupabaseStore() {
  return isSupabaseStoreEnabled();
}

export function isPersistentStoreActive() {
  return shouldUseSupabaseStore();
}

export async function saveProfile(profile: Profile) {
  return shouldUseSupabaseStore() ? supabase.saveProfile(profile) : inMemory.saveProfile(profile);
}

export async function getProfile(userId: string) {
  return shouldUseSupabaseStore() ? supabase.getProfile(userId) : inMemory.getProfile(userId);
}

export async function createSession(userId: string, mode: SessionRecord["mode"]) {
  const session = shouldUseSupabaseStore() ? await supabase.createSession(userId, mode) : inMemory.createSession(userId, mode);
  await recordLearningEvent({
    userId,
    sessionId: session.id,
    name: "session_started",
    occurredAt: session.startedAt,
    metadata: { mode }
  });
  return session;
}

export async function getSessionForUser(userId: string, sessionId: string) {
  return shouldUseSupabaseStore() ? supabase.getSessionForUser(userId, sessionId) : inMemory.getSessionForUser(userId, sessionId);
}

export async function endSession(
  sessionId: string,
  durationSec: number,
  summary?: string,
  userId?: string,
  options: EndSessionOptions = {}
) {
  const session = shouldUseSupabaseStore()
    ? supabase.endSession(sessionId, durationSec, summary, userId, options)
    : inMemory.endSession(sessionId, durationSec, summary, userId, options);
  const resolved = await session;
  if (resolved) {
    await recordLearningEvent({
      userId: resolved.userId,
      sessionId: resolved.id,
      name: "session_ended",
      occurredAt: resolved.endedAt,
      metadata: { durationSec: resolved.durationSec ?? durationSec }
    });
  }
  return resolved;
}

export async function recordTonePracticeAttempts(
  userId: string,
  sessionId: string,
  attempts: TonePracticeAttempt[]
) {
  return shouldUseSupabaseStore()
    ? supabase.recordTonePracticeAttempts(userId, sessionId, attempts)
    : inMemory.recordTonePracticeAttempts(userId, sessionId, attempts);
}

export async function listSessionsByUser(userId: string) {
  return shouldUseSupabaseStore() ? supabase.listSessionsByUser(userId) : inMemory.listSessionsByUser(userId);
}

export async function listOpenSessions(userId: string) {
  return shouldUseSupabaseStore() ? supabase.listOpenSessions(userId) : inMemory.listOpenSessions(userId);
}

export async function getLastCompletedSession(userId: string) {
  return shouldUseSupabaseStore() ? supabase.getLastCompletedSession(userId) : inMemory.getLastCompletedSession(userId);
}

export async function appendMessage(sessionId: string, role: MessageRecord["role"], content: string) {
  return shouldUseSupabaseStore() ? supabase.appendMessage(sessionId, role, content) : inMemory.appendMessage(sessionId, role, content);
}

export async function listSessionMessages(sessionId: string) {
  return shouldUseSupabaseStore() ? supabase.listSessionMessages(sessionId) : inMemory.listSessionMessages(sessionId);
}

export async function listSessionMessagesForUser(userId: string, sessionId: string) {
  return shouldUseSupabaseStore()
    ? supabase.listSessionMessagesForUser(userId, sessionId)
    : inMemory.listSessionMessagesForUser(userId, sessionId);
}

export async function listMemories(userId: string) {
  return shouldUseSupabaseStore() ? supabase.listMemories(userId) : inMemory.listMemories(userId);
}

export async function addMemory(userId: string, key: string, value: string, type: MemoryItem["type"] = "preference") {
  return shouldUseSupabaseStore() ? supabase.addMemory(userId, key, value, type) : inMemory.addMemory(userId, key, value, type);
}

export async function deleteMemory(userId: string, memoryId: string) {
  return shouldUseSupabaseStore() ? supabase.deleteMemory(userId, memoryId) : inMemory.deleteMemory(userId, memoryId);
}

export async function addSrsCards(userId: string, items: string[], context: SrsCardContext = {}) {
  return shouldUseSupabaseStore()
    ? supabase.addSrsCards(userId, items, context)
    : inMemory.addSrsCards(userId, items, context);
}

export async function getAllCards(userId: string) {
  return shouldUseSupabaseStore() ? supabase.getAllCards(userId) : inMemory.getAllCards(userId);
}

export async function addVocabItems(userId: string, items: string[], sourceSessionId?: string) {
  return shouldUseSupabaseStore()
    ? supabase.addVocabItems(userId, items, sourceSessionId)
    : inMemory.addVocabItems(userId, items, sourceSessionId);
}

export async function listVocabItems(userId: string) {
  return shouldUseSupabaseStore() ? supabase.listVocabItems(userId) : inMemory.listVocabItems(userId);
}

export async function addGrammarPoints(userId: string, signals: GrammarPointSignal[]) {
  return shouldUseSupabaseStore()
    ? supabase.addGrammarPoints(userId, signals)
    : inMemory.addGrammarPoints(userId, signals);
}

export async function listGrammarPoints(userId: string) {
  return shouldUseSupabaseStore() ? supabase.listGrammarPoints(userId) : inMemory.listGrammarPoints(userId);
}

export async function getDueCards(userId: string, limit = 10) {
  return shouldUseSupabaseStore() ? supabase.getDueCards(userId, limit) : inMemory.getDueCards(userId, limit);
}

export async function gradeCard(userId: string, cardId: string, grade: SrsGrade) {
  const card = shouldUseSupabaseStore()
    ? await supabase.gradeCard(userId, cardId, grade)
    : inMemory.gradeCard(userId, cardId, grade);
  if (card) {
    await recordLearningEvent({ userId, name: "review_completed", metadata: { grade } });
  }
  return card;
}

export async function recordLearningEvent(input: LearningEventInput) {
  try {
    return shouldUseSupabaseStore()
      ? await supabase.recordLearningEvent(input)
      : inMemory.recordLearningEvent(input);
  } catch (error) {
    // Analytics must never break the learning loop (for example when the migration lags).
    if (isMissingRelationError(error)) {
      warnOnceMissingRelation("learning_events", error);
      return null;
    }
    console.warn("Failed to record learning event", error);
    return null;
  }
}

export async function listLearningEvents(userId: string) {
  return shouldUseSupabaseStore()
    ? supabase.listLearningEvents(userId)
    : inMemory.listLearningEvents(userId);
}

export async function logAgentRun(run: Omit<AgentRun, "id" | "createdAt">) {
  try {
    return shouldUseSupabaseStore() ? await supabase.logAgentRun(run) : inMemory.logAgentRun(run);
  } catch (error) {
    if (isMissingRelationError(error)) {
      warnOnceMissingRelation("agent_runs usage columns", error);
      return;
    }
    console.warn("Failed to log agent run", error);
  }
}

export async function getSessionAgentUsage(userId: string, sessionId: string) {
  try {
    return shouldUseSupabaseStore()
      ? await supabase.getSessionAgentUsage(userId, sessionId)
      : inMemory.getSessionAgentUsage(userId, sessionId);
  } catch (error) {
    if (isMissingRelationError(error)) {
      warnOnceMissingRelation("agent_runs usage columns", error);
      return { tokens: 0, costEstimate: 0 };
    }
    throw error;
  }
}

export async function saveLearningPlan(plan: LearningPlan) {
  return shouldUseSupabaseStore() ? supabase.saveLearningPlan(plan) : inMemory.saveLearningPlan(plan);
}

export async function getLatestLearningPlan(userId: string) {
  return shouldUseSupabaseStore() ? supabase.getLatestLearningPlan(userId) : inMemory.getLatestLearningPlan(userId);
}

export async function updateLearningPlan(plan: LearningPlan) {
  return shouldUseSupabaseStore() ? supabase.updateLearningPlan(plan) : inMemory.updateLearningPlan(plan);
}

export async function getCachedCharacterCard(entry: string) {
  return shouldUseSupabaseStore() ? supabase.getCachedCharacterCard(entry) : inMemory.getCachedCharacterCard(entry);
}

export async function saveCharacterCard(card: CharacterCard) {
  return shouldUseSupabaseStore() ? supabase.saveCharacterCard(card) : inMemory.saveCharacterCard(card);
}

/** Everything the learner has met, merged from vocabulary items and review cards. */
export async function listStudiedEntries(userId: string): Promise<StudiedEntry[]> {
  const [vocab, cards] = await Promise.all([listVocabItems(userId), getAllCards(userId)]);
  const byEntry = new Map<string, StudiedEntry>();

  for (const card of cards) {
    const entry = card.prompt.trim();
    if (!entry) continue;
    const [pinyin, english] = card.answer.includes(" — ")
      ? card.answer.split(" — ", 2)
      : [undefined, card.answer];
    byEntry.set(entry, {
      entry,
      pinyin: pinyin?.trim() || undefined,
      english: english?.trim() || undefined,
      source: "srs",
      lastResult: card.lastResult,
      ease: card.ease,
      nextDueAt: card.nextDueAt
    });
  }

  for (const item of vocab) {
    const entry = item.hanzi.trim();
    if (!entry) continue;
    const existing = byEntry.get(entry);
    byEntry.set(entry, {
      entry,
      pinyin: item.pinyin ?? existing?.pinyin,
      english: item.english ?? existing?.english,
      source: existing?.source ?? "vocab",
      lastResult: existing?.lastResult,
      ease: existing?.ease,
      nextDueAt: existing?.nextDueAt,
      createdAt: item.createdAt
    });
  }

  return Array.from(byEntry.values()).sort((a, b) => a.entry.localeCompare(b.entry, "zh"));
}

export async function computeProgressSummary(userId: string) {
  return shouldUseSupabaseStore() ? supabase.computeProgressSummary(userId) : inMemory.computeProgressSummary(userId);
}

export { synthesizeTutorResponse };
