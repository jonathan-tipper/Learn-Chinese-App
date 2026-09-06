import type { ModelSelectionMode } from "@/lib/venice";
import {
  type AgentRunSummary,
  type LangGraphOutput,
  type TutorStateType,
  loadTutorContext,
  resolvePlanFocus,
  runLearningPersistNode,
  runMemoryCuratorNode,
  runTutorGraphWithLangGraph,
  runTutorResponseNode
} from "@/server/agents/langgraphRuntime";

export interface GraphInput {
  userId: string;
  sessionId: string;
  runId: string;
  message: string;
  intent?: string;
  verifyMode?: boolean;
  modelSelectionMode?: ModelSelectionMode;
  customModel?: string;
  planSnippet?: string;
  saveToReview?: boolean;
}

export type GraphOutput = LangGraphOutput;
export type { AgentRunSummary };

/**
 * Same node sequence as the LangGraph app, without a checkpointer. Used when the
 * LangGraph runtime itself fails (never for model errors, which should surface).
 */
async function runFallbackGraph(input: GraphInput): Promise<GraphOutput> {
  const context = await loadTutorContext(input);
  const planFocus = await resolvePlanFocus(input);

  const baseState: TutorStateType = {
    userId: input.userId,
    sessionId: input.sessionId,
    runId: input.runId,
    message: input.message,
    intent: input.intent,
    verifyMode: input.verifyMode,
    modelSelectionMode: input.modelSelectionMode,
    customModel: input.customModel,
    planSnippet: input.planSnippet,
    saveToReview: input.saveToReview,
    ...context,
    planFocus,
    structured: undefined,
    model: undefined,
    createdReviewCards: 0,
    memoriesSaved: [],
    nodesExecuted: ["ContextLoader", "MemoryRetrieve", "Planner"],
    agentRuns: [] as AgentRunSummary[]
  };

  const tutor = await runTutorResponseNode(baseState);
  const withTutor: TutorStateType = { ...baseState, ...tutor };

  const [persist, curated] = await Promise.all([
    runLearningPersistNode(withTutor),
    runMemoryCuratorNode(withTutor)
  ]);

  return {
    structured: tutor.structured,
    memoryContext: context.memoryContext,
    nodesExecuted: [
      ...baseState.nodesExecuted,
      ...tutor.nodesExecuted,
      ...persist.nodesExecuted,
      ...curated.nodesExecuted,
      "SafetyQualityGate",
      "PersistTelemetry"
    ],
    createdReviewCards: persist.createdReviewCards,
    memoriesSaved: curated.memoriesSaved,
    agentRuns: [...tutor.agentRuns, ...persist.agentRuns, ...curated.agentRuns],
    model: tutor.model
  };
}

function isLangGraphInfrastructureError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /checkpoint|langgraph|graph|postgres|ECONNREFUSED|channel/i.test(message)
    && !/venice|model|json/i.test(message);
}

export async function runTutorGraph(input: GraphInput): Promise<GraphOutput> {
  try {
    return await runTutorGraphWithLangGraph(input);
  } catch (error) {
    if (!isLangGraphInfrastructureError(error)) throw error;
    console.warn("LangGraph runtime unavailable, using sequential fallback:", error instanceof Error ? error.message : error);
    return runFallbackGraph(input);
  }
}
