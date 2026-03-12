import { randomUUID } from "crypto";
import type {
  AgentRun,
  MemoryItem,
  MessageRecord,
  Profile,
  SessionRecord,
  SrsCard,
  SrsGrade
} from "@/lib/types";
import { env } from "@/lib/env";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { DEFAULT_COMPLEX_MODEL, DEFAULT_SIMPLE_MODEL } from "@/lib/venice";
import { computeScheduling, parseReviewItem } from "@/server/store/srs";

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
  metrics_json: { durationSec?: number } | null;
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

function asStringArray(value: unknown, fallback: string[] = []) {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : fallback;
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
  return {
    id: row.id,
    userId: row.user_id,
    mode: row.mode,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    summary: row.summary ?? undefined,
    durationSec: row.metrics_json?.durationSec
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

  return { id, userId, mode, startedAt } satisfies SessionRecord;
}

export async function endSession(sessionId: string, durationSec: number, summary?: string, userId?: string) {
  const client = getSupabaseServiceClient();
  const endedAt = nowIso();

  let query = client
    .schema(env.supabaseDbSchema)
    .from("sessions")
    .update({
      ended_at: endedAt,
      summary: summary ?? null,
      metrics_json: { durationSec }
    })
    .eq("id", sessionId);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query
    .select("id, user_id, mode, started_at, ended_at, summary, metrics_json")
    .maybeSingle<SessionRow>();

  if (error) throw error;
  if (!data) return null;
  return mapSession(data);
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

export async function addSrsCards(userId: string, items: string[]) {
  if (!items.length) return [];

  const client = getSupabaseServiceClient();
  const now = nowIso();
  const rows = items.map((item) => {
    const parsed = parseReviewItem(item);
    const answer = parsed.english
      ? (parsed.pinyin ? `${parsed.pinyin} — ${parsed.english}` : parsed.english)
      : item;
    return {
      id: randomUUID(),
      user_id: userId,
      type: "vocab",
      prompt: parsed.chinese,
      answer,
      hints: ["Recall context from your last session"],
      tags: ["auto-generated"],
      ease: 2.5,
      interval: 1,
      next_due_at: now,
      updated_at: now
    };
  });

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
  return (data ?? []).map(mapCard);
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
  return (data ?? []).map(mapCard);
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
  const payload = {
    id: randomUUID(),
    user_id: run.userId,
    session_id: run.sessionId,
    node_name: run.nodeName,
    latency_ms: run.latencyMs,
    cost_estimate: run.costEstimate,
    created_at: nowIso()
  };

  const { error } = await from(client, "agent_runs").insert(payload);
  if (error) throw error;
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
  const sessions = await listSessionsByUser(userId);
  const cards = await getAllCards(userId);
  const dueCards = cards.filter((card) => new Date(card.nextDueAt).getTime() <= Date.now());

  const totalMinutes = sessions.reduce((acc, session) => acc + Math.round((session.durationSec ?? 0) / 60), 0);
  const streakDays = new Set(
    sessions
      .filter((session) => session.endedAt)
      .map((session) => (session.endedAt ?? session.startedAt).slice(0, 10))
  ).size;

  // Derive weak areas from cards that are struggling (ease < 2.0 or lastResult is "again"/"hard")
  const strugglingCards = cards.filter(
    (card) => card.ease < 2.0 || card.lastResult === "again" || card.lastResult === "hard"
  );
  const weakAreaSet = new Set<string>();
  for (const card of strugglingCards) {
    for (const tag of card.tags) {
      if (tag && tag !== "auto-generated") weakAreaSet.add(tag);
    }
    // Heuristic: if the answer mentions tones (numbers like ā/á/ǎ/à or tone markers), flag tone pairs
    if (/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(card.prompt) && card.lastResult === "again") {
      weakAreaSet.add("tone pairs");
    }
  }
  // If no specific weak areas detected but >20% of cards are struggling, add generic area
  const weakAreas = Array.from(weakAreaSet).slice(0, 4);
  if (weakAreas.length === 0 && cards.length > 0 && strugglingCards.length / cards.length > 0.2) {
    weakAreas.push("recently introduced vocabulary");
  }

  return {
    totalSessions: sessions.length,
    totalMinutes,
    streakDays,
    vocabLearning: cards.length,
    dueCards: dueCards.length,
    weakAreas
  };
}
