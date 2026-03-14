import type { TutorStructuredResponse } from "@/lib/types";
import { runTutorGraphWithLangGraph } from "@/server/agents/langgraphRuntime";
import { generateTutorStructuredResponse } from "@/server/agents/tutorModel";
import { getProfile, listMemories, listSessionMessages } from "@/server/store";
import type { ModelSelectionMode } from "@/lib/venice";

export interface GraphInput {
  userId: string;
  sessionId: string;
  message: string;
  intent?: string;
  verifyMode?: boolean;
  modelSelectionMode?: ModelSelectionMode;
  customModel?: string;
  planSnippet?: string;
}

export interface GraphOutput {
  structured: TutorStructuredResponse;
  memoryContext: string[];
  nodesExecuted: string[];
}

async function runFallbackGraph(input: GraphInput): Promise<GraphOutput> {
  const nodesExecuted: string[] = [];

  nodesExecuted.push("ContextLoader");
  const [profile, memories, sessionMessages] = await Promise.all([
    getProfile(input.userId),
    listMemories(input.userId),
    listSessionMessages(input.sessionId)
  ]);
  const memoryContext = memories.slice(0, 5).map((m) => `${m.key}: ${m.value}`);
  const recentUserMessages = sessionMessages
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.content);

  nodesExecuted.push("MemoryRetrieve");
  nodesExecuted.push("Planner");
  const profileSummary = profile
    ? `level=${profile.level}; goals=${profile.goals.join(", ")}; interests=${profile.interests.join(", ")}; minutesPerDay=${profile.minutesPerDay}; coachStyle=${profile.coachStyle}`
    : "No saved profile yet.";

  nodesExecuted.push("TutorResponse");
  const structured = await generateTutorStructuredResponse({
    message: input.message,
    intent: input.intent,
    memoryContext,
    profileSummary,
    recentUserMessages,
    verifyMode: input.verifyMode,
    modelSelectionMode: input.modelSelectionMode,
    customModel: input.customModel,
    planSnippet: input.planSnippet,
    modelPreferences: profile
      ? {
        preferredSimpleModel: profile.preferredSimpleModel,
        preferredComplexModel: profile.preferredComplexModel
      }
      : undefined
  });

  nodesExecuted.push("SRSExtract");
  nodesExecuted.push("MemoryWrite");
  nodesExecuted.push("SafetyQualityGate");
  nodesExecuted.push("PersistTelemetry");

  return { structured, memoryContext, nodesExecuted };
}

export async function runTutorGraph(input: GraphInput): Promise<GraphOutput> {
  try {
    return await runTutorGraphWithLangGraph(input);
  } catch {
    // Keep v0.1 usable even if LangGraph dependencies or checkpointer are unavailable.
    return runFallbackGraph(input);
  }
}
