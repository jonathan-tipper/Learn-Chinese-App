import { z } from "zod";
import { DEFAULT_COMPLEX_MODEL, DEFAULT_SIMPLE_MODEL } from "@/lib/venice";

export const sessionStartSchema = z.object({
  mode: z.enum(["daily", "ask", "quick"])
});

export const sessionEndSchema = z.object({
  sessionId: z.string().min(1),
  durationSec: z.number().int().nonnegative(),
  summary: z.string().optional()
});

export const chatSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
  intent: z.string().optional(),
  saveToReview: z.boolean().optional(),
  verifyMode: z.boolean().optional(),
  modelSelectionMode: z.enum(["auto", "simple", "complex", "custom"]).default("auto"),
  customModel: z.string().optional(),
  planSnippet: z.string().optional()
});

export const srsGradeSchema = z.object({
  cardId: z.string().min(1),
  grade: z.enum(["again", "hard", "good", "easy"])
});

export const memoryDeleteSchema = z.object({
  memoryId: z.string().min(1)
});

export const ttsSchema = z.object({
  text: z.string().min(1),
  voiceId: z.string().optional(),
  speed: z.number().min(0.5).max(2).optional(),
  lang: z.enum(["zh", "en"]).optional()
});

export const onboardingSchema = z.object({
  goals: z.array(z.string()).min(1),
  interests: z.array(z.string()).default([]),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  timezone: z.string(),
  coachStyle: z.enum(["strict", "friendly", "playful", "concise"]),
  minutesPerDay: z.number().min(5).max(60),
  preferredSimpleModel: z.string().default(DEFAULT_SIMPLE_MODEL),
  preferredComplexModel: z.string().default(DEFAULT_COMPLEX_MODEL)
});
