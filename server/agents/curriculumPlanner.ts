import { randomUUID } from "crypto";
import { z } from "zod";
import { env, isVeniceEnabled } from "@/lib/env";
import type { LearningPlan, LearningPlanItem, PlanModality, Profile, SessionRecord } from "@/lib/types";
import {
  computeProgressSummary,
  getLatestLearningPlan,
  getProfile,
  listSessionsByUser,
  listVocabItems,
  saveLearningPlan,
  updateLearningPlan
} from "@/server/store";
import { type TokenUsage, chatComplete, estimateModelCostUsd, parseJsonObject } from "@/server/llm/venice";

/**
 * Curriculum Planner agent.
 *
 * Produces a persisted, rolling 7-day plan from the learner's profile, recent session
 * summaries, weak areas, and review load. The plan is regenerated when the week is over
 * (or on demand) and today's item drives the session focus shown in chat.
 */

const FALLBACK_PLAN_SNIPPET = "Today: vocabulary review + one practical conversation exchange.";
const PLAN_DAYS = 7;
const MODALITIES: PlanModality[] = ["speaking", "listening", "reading", "writing", "review"];

const planItemSchema = z.object({
  day: z.number().int().min(1).max(PLAN_DAYS).optional(),
  title: z.string().min(1).max(80),
  canDo: z.string().min(1).max(200),
  lessonFocus: z.string().min(1).max(240),
  reviewFocus: z.string().min(1).max(200),
  modalities: z.array(z.string()).max(5).default([]),
  reason: z.string().min(1).max(240),
  estimatedMinutes: z.number().int().min(3).max(90).optional()
});

const planPayloadSchema = z.object({
  rationale: z.string().max(600).default(""),
  items: z.array(planItemSchema).min(1).max(PLAN_DAYS)
});

export type PlannerInputs = LearningPlan["inputs"];

export interface PlannerContext {
  profile: Profile | null;
  recentSessions: SessionRecord[];
  weakAreas: string[];
  dueCards: number;
  vocabLearning: number;
  vocabMastered: number;
  recentVocab: string[];
  previousPlan: LearningPlan | null;
  startDate: string;
}

/** YYYY-MM-DD for `date` in the learner's timezone (falls back to UTC on bad zones). */
export function localDateString(date: Date, timeZone?: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function addDays(isoDate: string, days: number) {
  const base = new Date(`${isoDate}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function planCoversDate(plan: Pick<LearningPlan, "startDate">, isoDate: string) {
  return isoDate >= plan.startDate && isoDate <= addDays(plan.startDate, PLAN_DAYS - 1);
}

export function planItemForDate(plan: LearningPlan, isoDate: string) {
  return plan.items.find((item) => item.date === isoDate);
}

export function formatPlanSnippet(item: LearningPlanItem) {
  const focus = item.lessonFocus.replace(/\.$/, "");
  return `Today: ${item.title} — ${focus}.`;
}

function normalizeModalities(values: string[]): PlanModality[] {
  const cleaned = values
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is PlanModality => (MODALITIES as string[]).includes(value));
  return cleaned.length ? Array.from(new Set(cleaned)) : ["speaking", "review"];
}

/** Pure: validate model output and fill in dates, day numbers and defaults. */
export function normalizePlanPayload(
  raw: unknown,
  context: Pick<PlannerContext, "startDate" | "profile">
): { rationale: string; items: LearningPlanItem[] } {
  const parsed = planPayloadSchema.parse(raw);
  const minutes = context.profile?.minutesPerDay ?? 10;
  const items: LearningPlanItem[] = parsed.items.slice(0, PLAN_DAYS).map((item, index) => ({
    day: index + 1,
    date: addDays(context.startDate, index),
    title: item.title.trim(),
    canDo: /^i can/i.test(item.canDo.trim()) ? item.canDo.trim() : `I can ${item.canDo.trim().replace(/^to\s+/i, "")}`,
    lessonFocus: item.lessonFocus.trim(),
    reviewFocus: item.reviewFocus.trim(),
    modalities: normalizeModalities(item.modalities),
    reason: item.reason.trim(),
    estimatedMinutes: item.estimatedMinutes ?? minutes,
    status: "planned"
  }));

  // Pad to a full week if the model returned fewer days.
  while (items.length < PLAN_DAYS) {
    const index = items.length;
    const isReviewDay = index === PLAN_DAYS - 1;
    items.push({
      day: index + 1,
      date: addDays(context.startDate, index),
      title: isReviewDay ? "Weekly review" : `Practice day ${index + 1}`,
      canDo: isReviewDay ? "I can reuse this week's phrases in a short conversation" : "I can use this week's phrases in one real exchange",
      lessonFocus: isReviewDay ? "Recombine the week's vocabulary in a roleplay." : "Continue the week's theme with fresh examples.",
      reviewFocus: "Due review cards",
      modalities: isReviewDay ? ["speaking", "review"] : ["review"],
      reason: "Added to complete the week.",
      estimatedMinutes: minutes,
      status: "planned"
    });
  }

  return { rationale: parsed.rationale.trim(), items };
}

/** Deterministic plan used when the model is unavailable. */
export function buildFallbackPlan(context: Pick<PlannerContext, "startDate" | "profile" | "weakAreas" | "dueCards">) {
  const goals = context.profile?.goals ?? [];
  const interests = context.profile?.interests ?? [];
  const theme = goals[0] ?? interests[0] ?? "daily life";
  const weak = context.weakAreas[0];
  const templates = [
    { title: "Greetings & warm-up", canDo: `I can greet someone and say one thing about ${theme}`, lessonFocus: `Greetings plus one sentence about ${theme}.`, modalities: ["speaking", "listening"] },
    { title: "Core phrases", canDo: `I can ask for what I need around ${theme}`, lessonFocus: `Two request patterns (请…, 我想…) applied to ${theme}.`, modalities: ["speaking", "reading"] },
    { title: "Listening focus", canDo: "I can catch key words in a short exchange", lessonFocus: weak ? `Listening drill targeting ${weak}.` : "Listen to and repeat three short exchanges.", modalities: ["listening", "speaking"] },
    { title: "Characters", canDo: "I can recognise this week's characters", lessonFocus: "Radicals and mnemonics for this week's new hanzi.", modalities: ["reading", "writing"] },
    { title: "Real-life roleplay", canDo: `I can hold a 4-line exchange about ${theme}`, lessonFocus: `Roleplay a realistic ${theme} scenario with corrections.`, modalities: ["speaking"] },
    { title: "Ask anything", canDo: "I can ask my coach a question in Chinese", lessonFocus: "Bring one question from your week; learn to ask it in Chinese.", modalities: ["speaking", "writing"] },
    { title: "Weekly review", canDo: "I can reuse this week's phrases without notes", lessonFocus: "Recombine the week's vocabulary in one conversation.", modalities: ["review", "speaking"] }
  ];

  const items: LearningPlanItem[] = templates.map((template, index) => ({
    day: index + 1,
    date: addDays(context.startDate, index),
    title: template.title,
    canDo: template.canDo,
    lessonFocus: template.lessonFocus,
    reviewFocus: context.dueCards > 0 ? `Clear ${Math.min(context.dueCards, 10)} due cards first` : "Any due review cards",
    modalities: template.modalities as PlanModality[],
    reason: "Default week while the planner has little history to work with.",
    estimatedMinutes: context.profile?.minutesPerDay ?? 10,
    status: "planned"
  }));

  return { rationale: "A balanced starter week built from your goals. It adapts as you complete sessions.", items };
}

function describeSessions(sessions: SessionRecord[]) {
  const withSummary = sessions.filter((session) => session.summary && session.endedAt).slice(0, 5);
  if (!withSummary.length) return "No completed sessions yet.";
  return withSummary
    .map((session) => `- ${(session.endedAt ?? session.startedAt).slice(0, 10)}: ${session.summary}`)
    .join("\n");
}

function describePreviousPlan(plan: LearningPlan | null) {
  if (!plan) return { text: "None.", carriedOver: [] as string[] };
  const completed = plan.items.filter((item) => item.status === "completed").map((item) => item.title);
  const carriedOver = plan.items.filter((item) => item.status !== "completed").map((item) => item.title);
  const text = [
    completed.length ? `Completed: ${completed.join("; ")}` : "Completed: none",
    carriedOver.length ? `Not done (carry forward or drop deliberately): ${carriedOver.join("; ")}` : ""
  ].filter(Boolean).join("\n");
  return { text, carriedOver };
}

function buildPlannerPrompt(context: PlannerContext) {
  const profile = context.profile;
  const previous = describePreviousPlan(context.previousPlan);
  return [
    "Design the next 7 days of Mandarin practice for this learner.",
    "",
    `Level: ${profile?.level ?? "beginner"}. Goals: ${profile?.goals.join(", ") || "not specified"}. Interests: ${profile?.interests.join(", ") || "not specified"}.`,
    `Minutes per day: ${profile?.minutesPerDay ?? 10}. Coach style: ${profile?.coachStyle ?? "friendly"}.`,
    `Review state: ${context.dueCards} cards due, ${context.vocabLearning} words in learning, ${context.vocabMastered} mastered.`,
    `Recently met vocabulary: ${context.recentVocab.length ? context.recentVocab.join(", ") : "none yet"}.`,
    `Weak areas: ${context.weakAreas.length ? context.weakAreas.join(", ") : "none identified"}.`,
    "Recent sessions:",
    describeSessions(context.recentSessions),
    "Previous plan:",
    previous.text,
    "",
    "Rules:",
    "- Day 1 is today. Each day must fit the minutes-per-day budget.",
    "- Anchor every day in the learner's real goals and interests; name concrete situations, not abstract grammar labels.",
    "- Progress across the week: introduce, then recombine, then a realistic roleplay, and finish with a review day.",
    "- Reuse recently met vocabulary before adding lots of new words. Spend at least one day on weak areas if any.",
    "- Mix modalities across the week from: speaking, listening, reading, writing, review.",
    "- canDo must start with 'I can' and describe a real-life outcome.",
    "Return JSON only: {\"rationale\": \"<=50 words on why this week looks like this\", \"items\": [7 × {\"day\": 1-7, \"title\": \"<=6 words\", \"canDo\": \"I can ...\", \"lessonFocus\": \"<=25 words\", \"reviewFocus\": \"<=15 words\", \"modalities\": [..], \"reason\": \"<=20 words tied to this learner\", \"estimatedMinutes\": number}]}"
  ].join("\n");
}

async function loadPlannerContext(userId: string, previousPlan: LearningPlan | null): Promise<PlannerContext> {
  const [profile, sessions, progress, vocab] = await Promise.all([
    getProfile(userId),
    listSessionsByUser(userId),
    computeProgressSummary(userId),
    listVocabItems(userId).catch(() => [])
  ]);

  return {
    profile,
    recentSessions: sessions,
    weakAreas: progress.weakAreas,
    dueCards: progress.dueCards,
    vocabLearning: progress.vocabLearning,
    vocabMastered: progress.vocabMastered,
    recentVocab: vocab.slice(0, 15).map((item) => item.hanzi),
    previousPlan,
    startDate: localDateString(new Date(), profile?.timezone)
  };
}

export interface GeneratedPlanResult {
  plan: LearningPlan;
  generated: boolean;
  usage?: TokenUsage;
  costUsd?: number;
  model?: string;
}

async function generatePlan(userId: string, context: PlannerContext): Promise<GeneratedPlanResult> {
  const inputs: PlannerInputs = {
    level: context.profile?.level,
    goals: context.profile?.goals,
    weakAreas: context.weakAreas,
    dueCards: context.dueCards,
    vocabLearning: context.vocabLearning,
    recentSummaries: context.recentSessions.filter((s) => s.summary && s.endedAt).slice(0, 5).map((s) => s.summary as string),
    carriedOver: describePreviousPlan(context.previousPlan).carriedOver
  };

  const base = {
    id: randomUUID(),
    userId,
    startDate: context.startDate,
    generatedAt: new Date().toISOString(),
    inputs
  };

  if (!isVeniceEnabled()) {
    const fallback = buildFallbackPlan(context);
    return { plan: { ...base, ...fallback, model: "fallback-template" }, generated: false };
  }

  try {
    const result = await chatComplete({
      model: env.veniceComplexModel,
      json: true,
      temperature: 0.4,
      maxTokens: 1800,
      timeoutMs: 60_000,
      messages: [
        {
          role: "system",
          content: "You are an expert Mandarin curriculum planner for a personalised coaching app. You produce realistic, motivating weekly plans grounded in the learner's own life. Always return valid JSON."
        },
        { role: "user", content: buildPlannerPrompt(context) }
      ]
    });

    const normalized = normalizePlanPayload(parseJsonObject(result.content), context);
    return {
      plan: { ...base, ...normalized, model: result.model },
      generated: true,
      usage: result.usage,
      model: result.model,
      costUsd: estimateModelCostUsd(result.model, result.usage)
    };
  } catch (error) {
    console.warn("Planner fell back to template:", error instanceof Error ? error.message : error);
    const fallback = buildFallbackPlan(context);
    return { plan: { ...base, ...fallback, model: "fallback-template" }, generated: false };
  }
}

const inFlight = new Map<string, Promise<GeneratedPlanResult | null>>();

/**
 * Return the plan covering today, generating a new one when none exists, the week is
 * over, or `force` is set. Concurrent callers share one generation.
 */
export async function ensureLearningPlan(
  userId: string,
  options: { force?: boolean } = {}
): Promise<GeneratedPlanResult | null> {
  const existing = await getLatestLearningPlan(userId);
  const profile = existing ? null : await getProfile(userId);
  const today = localDateString(new Date(), profile?.timezone);

  if (existing && !options.force && planCoversDate(existing, today)) {
    return { plan: existing, generated: false };
  }

  const key = userId;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const task = (async () => {
    try {
      const context = await loadPlannerContext(userId, existing);
      const result = await generatePlan(userId, context);
      await saveLearningPlan(result.plan);
      return result;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}

/** Read-only lookup of today's focus; never triggers generation. */
export async function getTodayPlanFocus(userId: string) {
  const plan = await getLatestLearningPlan(userId);
  if (!plan) return null;
  const profile = await getProfile(userId);
  const today = localDateString(new Date(), profile?.timezone);
  const item = planItemForDate(plan, today);
  if (!item) return null;
  return { focus: formatPlanSnippet(item), item, plan };
}

/** Used by /api/session/start: cheap, never blocks on plan generation. */
export async function generatePlanSnippet(userId: string): Promise<string> {
  try {
    const today = await getTodayPlanFocus(userId);
    return today?.focus ?? FALLBACK_PLAN_SNIPPET;
  } catch {
    return FALLBACK_PLAN_SNIPPET;
  }
}

/** Mark today's plan item complete after a real session. */
export async function markPlanProgress(userId: string, input: { sessionId: string; summary?: string }) {
  try {
    const plan = await getLatestLearningPlan(userId);
    if (!plan) return null;
    const profile = await getProfile(userId);
    const today = localDateString(new Date(), profile?.timezone);
    const item = planItemForDate(plan, today);
    if (!item || item.status === "completed") return plan;

    const items = plan.items.map((entry) =>
      entry.date === today
        ? {
          ...entry,
          status: "completed" as const,
          completedSessionId: input.sessionId,
          note: input.summary ? input.summary.slice(0, 160) : entry.note
        }
        : entry
    );
    const updated = { ...plan, items };
    await updateLearningPlan(updated);
    return updated;
  } catch (error) {
    console.warn("Plan progress update skipped:", error instanceof Error ? error.message : error);
    return null;
  }
}
