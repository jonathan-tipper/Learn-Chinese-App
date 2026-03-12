import { isSupabaseStoreEnabled } from "@/lib/env";
import type { AgentRun, MemoryItem, MessageRecord, Profile, SessionRecord, SrsGrade } from "@/lib/types";
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
  return shouldUseSupabaseStore() ? supabase.createSession(userId, mode) : inMemory.createSession(userId, mode);
}

export async function endSession(sessionId: string, durationSec: number, summary?: string, userId?: string) {
  return shouldUseSupabaseStore()
    ? supabase.endSession(sessionId, durationSec, summary, userId)
    : inMemory.endSession(sessionId, durationSec, summary, userId);
}

export async function listSessionsByUser(userId: string) {
  return shouldUseSupabaseStore() ? supabase.listSessionsByUser(userId) : inMemory.listSessionsByUser(userId);
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

export async function listMemories(userId: string) {
  return shouldUseSupabaseStore() ? supabase.listMemories(userId) : inMemory.listMemories(userId);
}

export async function addMemory(userId: string, key: string, value: string, type: MemoryItem["type"] = "preference") {
  return shouldUseSupabaseStore() ? supabase.addMemory(userId, key, value, type) : inMemory.addMemory(userId, key, value, type);
}

export async function deleteMemory(userId: string, memoryId: string) {
  return shouldUseSupabaseStore() ? supabase.deleteMemory(userId, memoryId) : inMemory.deleteMemory(userId, memoryId);
}

export async function addSrsCards(userId: string, items: string[]) {
  return shouldUseSupabaseStore() ? supabase.addSrsCards(userId, items) : inMemory.addSrsCards(userId, items);
}

export async function getAllCards(userId: string) {
  return shouldUseSupabaseStore() ? supabase.getAllCards(userId) : inMemory.getAllCards(userId);
}

export async function getDueCards(userId: string, limit = 10) {
  return shouldUseSupabaseStore() ? supabase.getDueCards(userId, limit) : inMemory.getDueCards(userId, limit);
}

export async function gradeCard(userId: string, cardId: string, grade: SrsGrade) {
  return shouldUseSupabaseStore() ? supabase.gradeCard(userId, cardId, grade) : inMemory.gradeCard(userId, cardId, grade);
}

export async function logAgentRun(run: Omit<AgentRun, "id" | "createdAt">) {
  return shouldUseSupabaseStore() ? supabase.logAgentRun(run) : inMemory.logAgentRun(run);
}

export async function computeProgressSummary(userId: string) {
  return shouldUseSupabaseStore() ? supabase.computeProgressSummary(userId) : inMemory.computeProgressSummary(userId);
}

export { synthesizeTutorResponse };
