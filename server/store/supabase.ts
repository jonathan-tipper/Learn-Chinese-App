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
  SessionMetrics,
  SessionRecord,
  SrsCard,
  SrsGrade,
  VocabItem
} from "@/lib/types";
import type { EndSessionOptions } from "@/server/store/contracts";
import { isMissingRelationError, warnOnceMissingRelation } from "@/server/store/errors";
import * as inMemory from "@/server/store/inMemory";
import { summarizeProgress } from "@/server/store/inMemory";
import { repairLegacyCard } from "@/server/store/legacyCards";
import { grammarPointIdentity } from "@/lib/grammar-points";
import { buildLearningEvent, type LearningEventInput } from "@/lib/learning-events";
import { normalizeTonePracticeAttempt, type TonePracticeAttempt } from "@/lib/tone-practice";
import { env } from "@/lib/env";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { DEFAULT_COMPLEX_MODEL, DEFAULT_SIMPLE_MODEL } from "@/lib/venice";
import {
  type SrsCardContext,
  buildAnswerSafeHints,
  buildCardTags,
  computeScheduling,
  formatReviewAnswer,
  isValidReviewItem,
  parseVocabItem,
  parseReviewItem,
  srsCardIdentity,
  vocabItemIdentity
} from "@/server/store/srs";

const nowIso = () => new Date().toISOString();
const from = (client: ReturnType<typeof getSupabaseServiceClient>, name: string) =>
  client.schema(env.supabaseDbSchema).from(name);

type ProfileRow = {
  user_id: string;
  goals: unknown;
  level: Profile["level"];
  preferences: unknown;
  timezone: string;
  coach_style: Profile["coachStyle"];
};

type SessionRow = {
  id: string;
  user_id: string;
  mode: SessionRecord["mode"];
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  metrics_json: SessionMetrics | null;
};

type MessageRow = {
  id: string;
  session_id: string;
  role: MessageRecord["role"];
  content: string;
  created_at: string;
};

type MemoryRow = {
  id: string;
  user_id: string;
  type: MemoryItem["type"];
  key: string;
  value_json: unknown;
  confidence: number;
  created_at: string;
  deleted_at: string | null;
};

type SrsRow = {
  id: string;
  user_id: string;
  prompt: string;
  answer: string;
  hints: unknown;
  tags: unknown;
  ease: number;
  interval: number;
  next_due_at: string;
  last_result: SrsGrade | null;
};

type VocabRow = {
  id: string;
  user_id: string;
  hanzi: string;
  pinyin: string | null;
  english: string | null;
  tags: unknown;
  source_session_id: string | null;
  created_at: string;
};

type GrammarPointRow = {
  id: string;
  user_id: string;
  title: string;
  explanation: string;
  examples_json: unknown;
  created_at: string;
};

type LearningEventRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  event_name: LearningEventInput["name"];
  metadata: Record<string, unknown>;
  occurred_at: string;
};

function asStringArray(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : fallback;
}

function parseSessionMetrics(value: unknown): SessionMetrics {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const metrics = value as SessionMetrics;
  return {
    durationSec: typeof metrics.durationSec === "number" ? metrics.durationSec : undefined,
    tonePracticeAttempts: Array.isArray(metrics.tonePracticeAttempts)
      ? metrics.tonePracticeAttempts
      : undefined,
    messageCount: typeof metrics.messageCount === "number" ? metrics.messageCount : undefined,
    lastActivityAt: typeof metrics.lastActivityAt === "string" ? metrics.lastActivityAt : undefined,
    autoClosed: metrics.autoClosed === true ? true : undefined,
    summaryGenerated: metrics.summaryGenerated === true ? true : undefined
  };
}

function parseMemoryValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "text" in value) {
    const maybeText = (value as { text?: unknown }).text;
    return typeof maybeText === "string" ? maybeText : JSON.stringify(value);
  }
  return JSON.stringify(value ?? "");
}

function mapSession(row: SessionRow): SessionRecord {
  const metrics = parseSessionMetrics(row.metrics_json);
  return {
    id: row.id,
    userId: row.user_id,
    mode: row.mode,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    summary: row.summary ?? undefined,
    durationSec: metrics.durationSec,
    metrics
  };
}

function mapMemory(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    key: row.key,
    value: parseMemoryValue(row.value_json),
    confidence: row.confidence,
    createdAt: row.created_at,
    deletedAt: row.deleted_at ?? undefined
  };
}

function mapCard(row: SrsRow): SrsCard {
  return {
    id: row.id,
    userId: row.user_id,
    prompt: row.prompt,
    answer: row.answer,
    hints: asStringArray(row.hints),
    tags: asStringArray(row.tags),
    ease: row.ease,
    interval: row.interval,
    nextDueAt: row.next_due_at,
    lastResult: row.last_result ?? undefined
  };
}

function mapVocabItem(row: VocabRow): VocabItem {
  return {
    id: row.id,
    userId: row.user_id,
    hanzi: row.hanzi,
    pinyin: row.pinyin ?? undefined,
    english: row.english ?? undefined,
    tags: asStringArray(row.tags),
    sourceSessionId: row.source_session_id ?? undefined,
    createdAt: row.created_at
  };
}

function mapGrammarPoint(row: GrammarPointRow): GrammarPoint {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    explanation: row.explanation,
    examples: asStringArray(row.examples_json),
    createdAt: row.created_at
  };
}

export async function saveProfile(profile: Profile) {
  const client = getSupabaseServiceClient();
  const preferences = {
    interests: profile.interests,
    minutesPerDay: profile.minutesPerDay,
    preferredSimpleModel: profile.preferredSimpleModel,
    preferredComplexModel: profile.preferredComplexModel
  };

  const { error } = await from(client, "profiles").upsert(
    {
      user_id: profile.userId,
      goals: profile.goals,
      level: profile.level,
      preferences,
      timezone: profile.timezone,
      coach_style: profile.coachStyle,
      updated_at: nowIso()
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
  return profile;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("profiles")
    .select("user_id, goals, level, preferences, timezone, coach_style")
    .eq("user_id", userId)
    .maybeSingle<ProfileRow>();

  if (error) throw error;
  if (!data) return null;

  const preferences = data.preferences && typeof data.preferences === "object"
    ? (data.preferences as {
      interests?: unknown;
      minutesPerDay?: unknown;
      preferredSimpleModel?: unknown;
      preferredComplexModel?: unknown;
    })
    : {};

  return {
    userId: data.user_id,
    goals: asStringArray(data.goals),
    level: data.level,
    interests: asStringArray(preferences.interests),
    timezone: data.timezone,
    coachStyle: data.coach_style,
    minutesPerDay: typeof preferences.minutesPerDay === "number" ? preferences.minutesPerDay : 10,
    preferredSimpleModel: typeof preferences.preferredSimpleModel === "string"
      ? preferences.preferredSimpleModel
      : DEFAULT_SIMPLE_MODEL,
    preferredComplexModel: typeof preferences.preferredComplexModel === "string"
      ? preferences.preferredComplexModel
      : DEFAULT_COMPLEX_MODEL
  };
}

export async function createSession(userId: string, mode: SessionRecord["mode"]) {
  const client = getSupabaseServiceClient();
  const id = randomUUID();
  const startedAt = nowIso();

  const { error } = await from(client, "sessions").insert({
    id,
    user_id: userId,
    mode,
    started_at: startedAt,
    metrics_json: {}
  });

  if (error) throw error;

  return { id, userId, mode, startedAt, metrics: {} } satisfies SessionRecord;
}

export async function getSessionForUser(userId: string, sessionId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("sessions")
    .select("id, user_id, mode, started_at, ended_at, summary, metrics_json")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle<SessionRow>();

  if (error) throw error;
  return data ? mapSession(data) : null;
}

export async function endSession(
  sessionId: string,
  durationSec: number,
  summary?: string,
  userId?: string,
  options: EndSessionOptions = {}
) {
  const client = getSupabaseServiceClient();
  const endedAt = options.endedAt ?? nowIso();

  let existingQuery = client
    .schema(env.supabaseDbSchema)
    .from("sessions")
    .select("id, metrics_json")
    .eq("id", sessionId);

  if (userId) {
    existingQuery = existingQuery.eq("user_id", userId);
  }

  const { data: existing, error: selectError } = await existingQuery
    .maybeSingle<{ id: string; metrics_json: SessionMetrics | null }>();

  if (selectError) throw selectError;
  if (!existing) return null;

  const metrics: SessionMetrics = {
    ...parseSessionMetrics(existing.metrics_json),
    durationSec,
    ...(options.autoClosed ? { autoClosed: true } : {}),
    ...(options.summaryGenerated ? { summaryGenerated: true } : {})
  };

  let updateQuery = client
    .schema(env.supabaseDbSchema)
    .from("sessions")
    .update({
      ended_at: endedAt,
      summary: summary ?? null,
      metrics_json: metrics
    })
    .eq("id", sessionId);

  if (userId) {
    updateQuery = updateQuery.eq("user_id", userId);
  }

  const { data, error } = await updateQuery
    .select("id, user_id, mode, started_at, ended_at, summary, metrics_json")
    .maybeSingle<SessionRow>();

  if (error) throw error;
  if (!data) return null;
  return mapSession(data);
}

export async function recordTonePracticeAttempts(
  userId: string,
  sessionId: string,
  attempts: TonePracticeAttempt[]
) {
  const client = getSupabaseServiceClient();
  const { data: existing, error: selectError } = await client
    .schema(env.supabaseDbSchema)
    .from("sessions")
    .select("id, metrics_json")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string; metrics_json: SessionMetrics | null }>();

  if (selectError) throw selectError;
  if (!existing) return null;

  const normalized = attempts.map((attempt) => normalizeTonePracticeAttempt(attempt, sessionId));
  const metrics = parseSessionMetrics(existing.metrics_json);
  const updatedMetrics = {
    ...metrics,
    tonePracticeAttempts: [
      ...(metrics.tonePracticeAttempts ?? []),
      ...normalized
    ]
  };

  const { error: updateError } = await client
    .schema(env.supabaseDbSchema)
    .from("sessions")
    .update({ metrics_json: updatedMetrics })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (updateError) throw updateError;
  return normalized;
}

export async function listSessionsByUser(userId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("sessions")
    .select("id, user_id, mode, started_at, ended_at, summary, metrics_json")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .returns<SessionRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapSession);
}

export async function listOpenSessions(userId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("sessions")
    .select("id, user_id, mode, started_at, ended_at, summary, metrics_json")
    .eq("user_id", userId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .returns<SessionRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapSession);
}

async function touchSessionActivity(sessionId: string, activityAt: string) {
  const client = getSupabaseServiceClient();
  const { data: existing, error: selectError } = await client
    .schema(env.supabaseDbSchema)
    .from("sessions")
    .select("id, metrics_json")
    .eq("id", sessionId)
    .maybeSingle<{ id: string; metrics_json: SessionMetrics | null }>();

  if (selectError) throw selectError;
  if (!existing) return;

  const metrics = parseSessionMetrics(existing.metrics_json);
  const { error } = await client
    .schema(env.supabaseDbSchema)
    .from("sessions")
    .update({
      metrics_json: {
        ...metrics,
        messageCount: (metrics.messageCount ?? 0) + 1,
        lastActivityAt: activityAt
      }
    })
    .eq("id", sessionId);

  if (error) throw error;
}

export async function appendMessage(sessionId: string, role: MessageRecord["role"], content: string) {
  const client = getSupabaseServiceClient();
  const message: MessageRecord = {
    id: randomUUID(),
    sessionId,
    role,
    content,
    createdAt: nowIso()
  };

  const { error } = await from(client, "messages").insert({
    id: message.id,
    session_id: message.sessionId,
    role: message.role,
    content: message.content,
    created_at: message.createdAt
  });

  if (error) throw error;

  try {
    await touchSessionActivity(sessionId, message.createdAt);
  } catch (activityError) {
    console.warn("Failed to record session activity", activityError);
  }

  return message;
}

export async function listSessionMessages(sessionId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("messages")
    .select("id, session_id, role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .returns<MessageRow[]>();

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at
  }));
}

export async function listSessionMessagesForUser(userId: string, sessionId: string) {
  const session = await getSessionForUser(userId, sessionId);
  if (!session) return [];
  return listSessionMessages(sessionId);
}

export async function listMemories(userId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("memories")
    .select("id, user_id, type, key, value_json, confidence, created_at, deleted_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .returns<MemoryRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapMemory);
}

export async function addMemory(userId: string, key: string, value: string, type: MemoryItem["type"] = "preference") {
  const client = getSupabaseServiceClient();
  const item: MemoryItem = {
    id: randomUUID(),
    userId,
    type,
    key,
    value,
    confidence: 0.7,
    createdAt: nowIso()
  };

  const { error } = await from(client, "memories").insert({
    id: item.id,
    user_id: item.userId,
    type: item.type,
    key: item.key,
    value_json: value,
    confidence: item.confidence,
    created_at: item.createdAt,
    updated_at: item.createdAt
  });

  if (error) throw error;
  return item;
}

export async function deleteMemory(userId: string, memoryId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("memories")
    .update({ deleted_at: nowIso(), updated_at: nowIso() })
    .eq("id", memoryId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id")
    .returns<Array<{ id: string }>>();

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function addSrsCards(userId: string, items: string[], context: SrsCardContext = {}) {
  if (!items.length) return [];

  const client = getSupabaseServiceClient();
  const now = nowIso();
  const existing = await getAllCards(userId);
  const seen = new Set(existing.map((card) => srsCardIdentity(card.prompt, card.answer)));
  const rows = [];

  for (const item of items) {
    const parsed = parseReviewItem(item);
    if (!isValidReviewItem(parsed)) continue;

    const answer = formatReviewAnswer(parsed);
    const identity = srsCardIdentity(parsed.chinese, answer);
    if (seen.has(identity)) continue;
    seen.add(identity);

    rows.push({
      id: randomUUID(),
      user_id: userId,
      type: "vocab",
      prompt: parsed.chinese,
      answer,
      hints: buildAnswerSafeHints(parsed.chinese, context),
      tags: buildCardTags(context),
      ease: 2.5,
      interval: 1,
      next_due_at: now,
      updated_at: now
    });
  }

  if (!rows.length) return [];

  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("srs_cards")
    .insert(rows)
    .select("id, user_id, prompt, answer, hints, tags, ease, interval, next_due_at, last_result")
    .returns<SrsRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapCard);
}

export async function getAllCards(userId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("srs_cards")
    .select("id, user_id, prompt, answer, hints, tags, ease, interval, next_due_at, last_result")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .returns<SrsRow[]>();

  if (error) throw error;
  return (data ?? []).map((row) => repairLegacyCard(mapCard(row)).card);
}

export async function addVocabItems(userId: string, items: string[], sourceSessionId?: string) {
  if (!items.length) return [];

  const client = getSupabaseServiceClient();
  const existing = await listVocabItems(userId);
  const upserted: VocabItem[] = [];
  const seenInput = new Set<string>();

  for (const item of items) {
    const parsed = parseVocabItem(item);
    if (!parsed) continue;

    const identity = vocabItemIdentity(parsed.hanzi, parsed.pinyin);
    if (seenInput.has(identity)) continue;
    seenInput.add(identity);

    const existingItem = existing.find((current) => vocabItemIdentity(current.hanzi, current.pinyin) === identity);
    if (existingItem) {
      const { data, error } = await client
        .schema(env.supabaseDbSchema)
        .from("vocab_items")
        .update({
          pinyin: parsed.pinyin ?? existingItem.pinyin ?? null,
          english: parsed.english ?? existingItem.english ?? null,
          source_session_id: sourceSessionId ?? existingItem.sourceSessionId ?? null
        })
        .eq("id", existingItem.id)
        .eq("user_id", userId)
        .select("id, user_id, hanzi, pinyin, english, tags, source_session_id, created_at")
        .maybeSingle<VocabRow>();

      if (error) throw error;
      if (data) {
        const mapped = mapVocabItem(data);
        upserted.push(mapped);
        const existingIndex = existing.findIndex((current) => current.id === mapped.id);
        if (existingIndex >= 0) existing[existingIndex] = mapped;
      }
      continue;
    }

    const { data, error } = await client
      .schema(env.supabaseDbSchema)
      .from("vocab_items")
      .insert({
        id: randomUUID(),
        user_id: userId,
        hanzi: parsed.hanzi,
        pinyin: parsed.pinyin ?? null,
        english: parsed.english ?? null,
        tags: ["auto-generated"],
        source_session_id: sourceSessionId ?? null
      })
      .select("id, user_id, hanzi, pinyin, english, tags, source_session_id, created_at")
      .maybeSingle<VocabRow>();

    if (error) throw error;
    if (data) {
      const mapped = mapVocabItem(data);
      existing.push(mapped);
      upserted.push(mapped);
    }
  }

  return upserted;
}

export async function listVocabItems(userId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("vocab_items")
    .select("id, user_id, hanzi, pinyin, english, tags, source_session_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .returns<VocabRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapVocabItem);
}

export async function addGrammarPoints(userId: string, signals: GrammarPointSignal[]) {
  if (!signals.length) return [];

  const client = getSupabaseServiceClient();
  const existing = await listGrammarPoints(userId);
  const upserted: GrammarPoint[] = [];
  const seenInput = new Set<string>();

  for (const signal of signals) {
    const identity = grammarPointIdentity(signal.title);
    if (seenInput.has(identity)) continue;
    seenInput.add(identity);

    const existingItem = existing.find((current) => grammarPointIdentity(current.title) === identity);
    if (existingItem) {
      const { data, error } = await client
        .schema(env.supabaseDbSchema)
        .from("grammar_points")
        .update({ explanation: signal.explanation, examples_json: signal.examples })
        .eq("id", existingItem.id)
        .eq("user_id", userId)
        .select("id, user_id, title, explanation, examples_json, created_at")
        .maybeSingle<GrammarPointRow>();

      if (error) throw error;
      if (data) {
        const mapped = mapGrammarPoint(data);
        upserted.push(mapped);
        const existingIndex = existing.findIndex((current) => current.id === mapped.id);
        if (existingIndex >= 0) existing[existingIndex] = mapped;
      }
      continue;
    }

    const { data, error } = await client
      .schema(env.supabaseDbSchema)
      .from("grammar_points")
      .insert({
        id: randomUUID(),
        user_id: userId,
        title: signal.title,
        explanation: signal.explanation,
        examples_json: signal.examples
      })
      .select("id, user_id, title, explanation, examples_json, created_at")
      .maybeSingle<GrammarPointRow>();

    if (error) throw error;
    if (data) {
      const mapped = mapGrammarPoint(data);
      existing.push(mapped);
      upserted.push(mapped);
    }
  }

  return upserted;
}

export async function listGrammarPoints(userId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("grammar_points")
    .select("id, user_id, title, explanation, examples_json, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .returns<GrammarPointRow[]>();

  if (error) throw error;
  return (data ?? []).map(mapGrammarPoint);
}

export async function getDueCards(userId: string, limit = 10) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("srs_cards")
    .select("id, user_id, prompt, answer, hints, tags, ease, interval, next_due_at, last_result")
    .eq("user_id", userId)
    .lte("next_due_at", nowIso())
    .order("next_due_at", { ascending: true })
    .limit(limit)
    .returns<SrsRow[]>();

  if (error) throw error;

  const cards: SrsCard[] = [];
  const repairs: SrsCard[] = [];
  for (const row of data ?? []) {
    const { card, repaired } = repairLegacyCard(mapCard(row));
    cards.push(card);
    if (repaired) repairs.push(card);
  }

  if (repairs.length) {
    // Write the repaired prompt/answer back so the fix is permanent; never block the review.
    void Promise.all(
      repairs.map((card) =>
        client
          .schema(env.supabaseDbSchema)
          .from("srs_cards")
          .update({ prompt: card.prompt, answer: card.answer, updated_at: nowIso() })
          .eq("id", card.id)
          .eq("user_id", userId)
      )
    ).catch((repairError) => console.warn("Legacy card repair write-back failed", repairError));
  }

  return cards;
}

type LearningPlanRow = {
  id: string;
  user_id: string;
  start_date: string;
  generated_at: string;
  plan_json: unknown;
  model: string | null;
};

function mapLearningPlan(row: LearningPlanRow): LearningPlan | null {
  const payload = row.plan_json && typeof row.plan_json === "object" ? (row.plan_json as Partial<LearningPlan>) : null;
  if (!payload || !Array.isArray(payload.items)) return null;
  return {
    id: row.id,
    userId: row.user_id,
    startDate: row.start_date,
    generatedAt: row.generated_at,
    items: payload.items,
    rationale: typeof payload.rationale === "string" ? payload.rationale : "",
    inputs: payload.inputs && typeof payload.inputs === "object" ? payload.inputs : {},
    model: row.model ?? payload.model
  };
}

function planPayload(plan: LearningPlan) {
  return { items: plan.items, rationale: plan.rationale, inputs: plan.inputs, model: plan.model };
}

export async function saveLearningPlan(plan: LearningPlan) {
  const client = getSupabaseServiceClient();
  const { error } = await from(client, "learning_plans").insert({
    id: plan.id,
    user_id: plan.userId,
    start_date: plan.startDate,
    generated_at: plan.generatedAt,
    plan_json: planPayload(plan),
    model: plan.model ?? null,
    updated_at: nowIso()
  });

  if (error) {
    if (isMissingRelationError(error)) {
      warnOnceMissingRelation("learning_plans", error);
      return inMemory.saveLearningPlan(plan);
    }
    throw error;
  }
  return plan;
}

export async function getLatestLearningPlan(userId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("learning_plans")
    .select("id, user_id, start_date, generated_at, plan_json, model")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .returns<LearningPlanRow[]>();

  if (error) {
    if (isMissingRelationError(error)) {
      warnOnceMissingRelation("learning_plans", error);
      return inMemory.getLatestLearningPlan(userId);
    }
    throw error;
  }
  return data?.[0] ? mapLearningPlan(data[0]) : null;
}

export async function updateLearningPlan(plan: LearningPlan) {
  const client = getSupabaseServiceClient();
  const { error } = await client
    .schema(env.supabaseDbSchema)
    .from("learning_plans")
    .update({ plan_json: planPayload(plan), updated_at: nowIso() })
    .eq("id", plan.id)
    .eq("user_id", plan.userId);

  if (error) {
    if (isMissingRelationError(error)) {
      warnOnceMissingRelation("learning_plans", error);
      return inMemory.updateLearningPlan(plan);
    }
    throw error;
  }
  return plan;
}

export async function getCachedCharacterCard(entry: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("character_cards")
    .select("entry, card_json")
    .eq("entry", entry)
    .maybeSingle<{ entry: string; card_json: unknown }>();

  if (error) {
    if (isMissingRelationError(error)) {
      warnOnceMissingRelation("character_cards", error);
      return inMemory.getCachedCharacterCard(entry);
    }
    throw error;
  }
  if (!data?.card_json || typeof data.card_json !== "object") return null;
  return data.card_json as CharacterCard;
}

export async function saveCharacterCard(card: CharacterCard) {
  const client = getSupabaseServiceClient();
  const { error } = await from(client, "character_cards").upsert(
    {
      entry: card.entry,
      card_json: card,
      generated_by: card.generatedBy,
      generated_at: card.generatedAt
    },
    { onConflict: "entry" }
  );

  if (error) {
    if (isMissingRelationError(error)) {
      warnOnceMissingRelation("character_cards", error);
      return inMemory.saveCharacterCard(card);
    }
    throw error;
  }
  return card;
}

export async function gradeCard(userId: string, cardId: string, grade: SrsGrade) {
  const client = getSupabaseServiceClient();
  const { data: existing, error: selectError } = await client
    .schema(env.supabaseDbSchema)
    .from("srs_cards")
    .select("id, ease, interval")
    .eq("id", cardId)
    .eq("user_id", userId)
    .maybeSingle<{ id: string; ease: number; interval: number }>();

  if (selectError) throw selectError;
  if (!existing) return null;

  const { interval, ease, nextDueAt } = computeScheduling(existing.interval, existing.ease, grade);

  const { data: updated, error: updateError } = await client
    .schema(env.supabaseDbSchema)
    .from("srs_cards")
    .update({
      interval,
      ease,
      next_due_at: nextDueAt,
      last_result: grade,
      updated_at: nowIso()
    })
    .eq("id", cardId)
    .eq("user_id", userId)
    .select("id, user_id, prompt, answer, hints, tags, ease, interval, next_due_at, last_result")
    .maybeSingle<SrsRow>();

  if (updateError) throw updateError;
  if (!updated) return null;
  return mapCard(updated);
}

export async function logAgentRun(run: Omit<AgentRun, "id" | "createdAt">) {
  const client = getSupabaseServiceClient();
  const legacyPayload = {
    id: randomUUID(),
    user_id: run.userId,
    session_id: run.sessionId ?? null,
    node_name: run.nodeName,
    latency_ms: run.latencyMs,
    cost_estimate: run.costEstimate,
    created_at: nowIso()
  };
  const payload = { ...legacyPayload, provider: run.provider, tokens: run.tokens };

  const { error } = await from(client, "agent_runs").insert(payload);
  if (!error) return;

  // The usage columns arrive with migration 20260711231000; keep recording runs without them.
  if (isMissingRelationError(error)) {
    warnOnceMissingRelation("agent_runs usage columns", error);
    const { error: legacyError } = await from(client, "agent_runs").insert(legacyPayload);
    if (legacyError) throw legacyError;
    return;
  }

  throw error;
}

export async function getSessionAgentUsage(userId: string, sessionId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await from(client, "agent_runs")
    .select("tokens, cost_estimate")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .returns<Array<{ tokens: number | null; cost_estimate: number | string | null }>>();

  if (error) throw error;
  return (data ?? []).reduce(
    (total, row) => ({
      tokens: total.tokens + (row.tokens ?? 0),
      costEstimate: total.costEstimate + Number(row.cost_estimate ?? 0)
    }),
    { tokens: 0, costEstimate: 0 }
  );
}

export async function recordLearningEvent(input: LearningEventInput) {
  const event = buildLearningEvent(input);
  const client = getSupabaseServiceClient();
  const { error } = await from(client, "learning_events").upsert({
    id: event.id,
    user_id: event.userId,
    session_id: event.sessionId ?? null,
    event_name: event.name,
    metadata: event.metadata,
    occurred_at: event.occurredAt
  }, { onConflict: "session_id,event_name", ignoreDuplicates: true });

  if (error) throw error;
  return event;
}

export async function listLearningEvents(userId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await from(client, "learning_events")
    .select("id, user_id, session_id, event_name, metadata, occurred_at")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: true })
    .returns<LearningEventRow[]>();

  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...buildLearningEvent({
      userId: row.user_id,
      sessionId: row.session_id ?? undefined,
      name: row.event_name,
      occurredAt: row.occurred_at,
      metadata: row.metadata
    }),
    id: row.id
  }));
}

export async function getLastCompletedSession(userId: string): Promise<SessionRecord | null> {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .schema(env.supabaseDbSchema)
    .from("sessions")
    .select("id, user_id, mode, started_at, ended_at, summary, metrics_json")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(1)
    .returns<SessionRow[]>();

  if (error) throw error;
  return data?.[0] ? mapSession(data[0]) : null;
}

export async function computeProgressSummary(userId: string) {
  const [sessions, cards] = await Promise.all([listSessionsByUser(userId), getAllCards(userId)]);
  const dueCount = cards.filter((card) => new Date(card.nextDueAt).getTime() <= Date.now()).length;
  return summarizeProgress(sessions, cards, dueCount);
}
