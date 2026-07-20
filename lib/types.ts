import type { TonePracticeAttempt } from "@/lib/tone-practice";

export type CoachStyle = "strict" | "friendly" | "playful" | "concise";
export type SessionMode = "daily" | "ask" | "quick";
export type MessageRole = "user" | "assistant" | "system";
export type SrsGrade = "again" | "hard" | "good" | "easy";
export type ModelSelectionMode = "auto" | "simple" | "complex" | "custom";

export interface SessionMetrics {
  durationSec?: number;
  tonePracticeAttempts?: TonePracticeAttempt[];
}

export interface Profile {
  userId: string;
  goals: string[];
  level: "beginner" | "intermediate" | "advanced";
  interests: string[];
  timezone: string;
  coachStyle: CoachStyle;
  minutesPerDay: number;
  preferredSimpleModel: string;
  preferredComplexModel: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  mode: SessionMode;
  startedAt: string;
  endedAt?: string;
  summary?: string;
  durationSec?: number;
  metrics?: SessionMetrics;
}

export interface MessageRecord {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface MemoryItem {
  id: string;
  userId: string;
  type: "goal" | "preference" | "topic" | "vocab";
  key: string;
  value: string;
  confidence: number;
  createdAt: string;
  deletedAt?: string;
}

export interface SrsCard {
  id: string;
  userId: string;
  prompt: string;
  answer: string;
  hints: string[];
  tags: string[];
  ease: number;
  interval: number;
  nextDueAt: string;
  lastResult?: SrsGrade;
}

export interface VocabItem {
  id: string;
  userId: string;
  hanzi: string;
  pinyin?: string;
  english?: string;
  tags: string[];
  sourceSessionId?: string;
  createdAt: string;
}

export interface GrammarPointSignal {
  title: string;
  explanation: string;
  examples: string[];
  confidence: "high";
}

export interface GrammarPoint {
  id: string;
  userId: string;
  title: string;
  explanation: string;
  examples: string[];
  createdAt: string;
}

export interface AgentRun {
  id: string;
  userId: string;
  sessionId: string;
  nodeName: string;
  provider: string;
  tokens: number;
  latencyMs: number;
  costEstimate: number;
  createdAt: string;
}

export interface TutorStructuredResponse {
  keyPoints: string[];
  examples: string[];
  microExercise: string;
  suggestedReviewItems: string[];
  grammarPoints?: GrammarPointSignal[];
  answer: string;
}
