import { randomUUID } from "crypto";
import { z } from "zod";
import type { SessionMode, SrsGrade } from "@/lib/types";

export type LearningEventName = "session_started" | "session_ended" | "review_completed";

export type LearningEventMetadata =
  | { mode: SessionMode }
  | { durationSec: number }
  | { grade: SrsGrade };

export interface LearningEventInput {
  userId: string;
  sessionId?: string;
  name: LearningEventName;
  occurredAt?: string;
  metadata: Record<string, unknown>;
}

export interface LearningEvent extends Omit<LearningEventInput, "occurredAt" | "metadata"> {
  id: string;
  occurredAt: string;
  metadata: LearningEventMetadata;
}

const sessionStartedMetadataSchema = z.object({
  mode: z.enum(["daily", "ask", "quick"])
}).strip();

const sessionEndedMetadataSchema = z.object({
  durationSec: z.number().int().nonnegative()
}).strip();

const reviewCompletedMetadataSchema = z.object({
  grade: z.enum(["again", "hard", "good", "easy"])
}).strip();

export function buildLearningEvent(input: LearningEventInput): LearningEvent {
  const schema = input.name === "session_started"
    ? sessionStartedMetadataSchema
    : input.name === "session_ended"
      ? sessionEndedMetadataSchema
      : reviewCompletedMetadataSchema;
  const parsed = schema.safeParse(input.metadata);
  if (!parsed.success) {
    throw new Error("Invalid learning event metadata");
  }

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(occurredAt))) {
    throw new Error("Invalid learning event timestamp");
  }

  return {
    id: randomUUID(),
    userId: input.userId,
    sessionId: input.sessionId,
    name: input.name,
    occurredAt,
    metadata: parsed.data
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(value: string) {
  return Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function retentionAt(events: LearningEvent[], asOfDay: number, offsetDays: number) {
  const daysByUser = new Map<string, Set<number>>();
  for (const event of events) {
    const days = daysByUser.get(event.userId) ?? new Set<number>();
    days.add(utcDay(event.occurredAt));
    daysByUser.set(event.userId, days);
  }

  let eligibleUsers = 0;
  let retainedUsers = 0;
  for (const days of daysByUser.values()) {
    const firstDay = Math.min(...days);
    const targetDay = firstDay + offsetDays * DAY_MS;
    if (targetDay > asOfDay) continue;
    eligibleUsers++;
    if (days.has(targetDay)) retainedUsers++;
  }

  return {
    eligibleUsers,
    retainedUsers,
    rate: eligibleUsers === 0 ? 0 : retainedUsers / eligibleUsers
  };
}

export function summarizeLearningEvents(events: LearningEvent[], asOf = new Date().toISOString()) {
  const asOfDay = utcDay(asOf);
  const ended = events.filter((event) => event.name === "session_ended");
  const totalDurationSec = ended.reduce(
    (total, event) => total + ("durationSec" in event.metadata ? event.metadata.durationSec : 0),
    0
  );

  return {
    retention: {
      d1: retentionAt(events, asOfDay, 1),
      d7: retentionAt(events, asOfDay, 7)
    },
    sessionsEnded: ended.length,
    averageSessionDurationSec: ended.length === 0 ? 0 : totalDurationSec / ended.length,
    reviewCompletions: events.filter((event) => event.name === "review_completed").length
  };
}
