export type CoachStyle = "strict" | "friendly" | "playful" | "concise";
export type SessionMode = "daily" | "ask" | "quick";
export type MessageRole = "user" | "assistant" | "system";
export type SrsGrade = "again" | "hard" | "good" | "easy";

export interface Profile {
  userId: string;
  goals: string[];
  level: "beginner" | "intermediate" | "advanced";
  interests: string[];
  timezone: string;
  coachStyle: CoachStyle;
  minutesPerDay: number;
}

export interface SessionRecord {
  id: string;
  userId: string;
  mode: SessionMode;
  startedAt: string;
  endedAt?: string;
  summary?: string;
  durationSec?: number;
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

export interface AgentRun {
  id: string;
  userId: string;
  sessionId: string;
  nodeName: string;
  latencyMs: number;
  costEstimate: number;
  createdAt: string;
}

export interface TutorStructuredResponse {
  keyPoints: string[];
  examples: string[];
  microExercise: string;
  suggestedReviewItems: string[];
  answer: string;
}
