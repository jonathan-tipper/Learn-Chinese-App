import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { env } from "@/lib/env";
import type { MemoryItem, Profile, TutorStructuredResponse } from "@/lib/types";
import type { ModelSelectionMode } from "@/lib/venice";
import { getTodayPlanFocus } from "@/server/agents/curriculumPlanner";
import { curateMemories } from "@/server/agents/memoryCurator";
import { getStreamSink } from "@/server/agents/streamSink";
import { type TutorHistoryMessage, generateTutorResponse } from "@/server/agents/tutorModel";
import {
  addGrammarPoints,
  addSrsCards,
  addVocabItems,
  computeProgressSummary,
  getProfile,
  listMemories,
  listSessionMessagesForUser
} from "@/server/store";
import { deriveReviewItems } from "@/server/agents/reviewItems";

/**
 * Tutor graph:
 *
 *   START → contextLoader → planner → tutorResponse ─┬→ learningPersist ─┬→ END
 *                                                    └→ memoryCurator ───┘
 *
 * contextLoader   profile, long-term memories, conversation history, weak areas, due cards
 * planner         today's focus from the persisted curriculum plan
 * tutorResponse   streams the answer via the registered sink, then the structured payload
 * learningPersist SRS cards (with answer-safe hints), vocab items, grammar points
 * memoryCurator   extracts durable learner facts into long-term memory
 */

export interface LangGraphInput {
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

export interface AgentRunSummary {
  nodeName: string;
  model?: string;
  tokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface LangGraphOutput {
  structured: TutorStructuredResponse;
  memoryContext: string[];
  nodesExecuted: string[];
  createdReviewCards: number;
  memoriesSaved: MemoryItem[];
  agentRuns: AgentRunSummary[];
  model?: string;
}

const appendReducer = <T>(left: T[] | undefined, right: T[] | undefined) => [...(left ?? []), ...(right ?? [])];

const TutorState = Annotation.Root({
  userId: Annotation<string>(),
  sessionId: Annotation<string>(),
  runId: Annotation<string>(),
  message: Annotation<string>(),
  intent: Annotation<string | undefined>(),
  verifyMode: Annotation<boolean | undefined>(),
  modelSelectionMode: Annotation<ModelSelectionMode | undefined>(),
  customModel: Annotation<string | undefined>(),
  planSnippet: Annotation<string | undefined>(),
  saveToReview: Annotation<boolean | undefined>(),
  profile: Annotation<Profile | null>(),
  memories: Annotation<MemoryItem[]>(),
  memoryContext: Annotation<string[]>(),
  history: Annotation<TutorHistoryMessage[]>(),
  weakAreas: Annotation<string[]>(),
  dueCards: Annotation<number>(),
  planFocus: Annotation<string | undefined>(),
  structured: Annotation<TutorStructuredResponse | undefined>(),
  model: Annotation<string | undefined>(),
  createdReviewCards: Annotation<number>(),
  memoriesSaved: Annotation<MemoryItem[]>(),
  nodesExecuted: Annotation<string[]>({ reducer: appendReducer, default: () => [] }),
  agentRuns: Annotation<AgentRunSummary[]>({ reducer: appendReducer, default: () => [] })
});

export type TutorStateType = typeof TutorState.State;

let postgresCheckpointerPromise: Promise<PostgresSaver> | null = null;

async function getCheckpointer() {
  if (!env.langGraphPostgresUrl) {
    return new MemorySaver();
  }

  if (!postgresCheckpointerPromise) {
    postgresCheckpointerPromise = (async () => {
      const checkpointer = PostgresSaver.fromConnString(env.langGraphPostgresUrl);
      await checkpointer.setup();
      return checkpointer;
    })();
  }

  return postgresCheckpointerPromise;
}

const MAX_MEMORIES_IN_CONTEXT = 20;

export function formatMemoryContext(memories: MemoryItem[]) {
  return memories.slice(0, MAX_MEMORIES_IN_CONTEXT).map((memory) => `${memory.key}: ${memory.value}`);
}

/** Conversation so far, excluding the message currently being answered. */
export function historyFromMessages(
  messages: Array<{ role: string; content: string }>,
  currentMessage: string
): TutorHistoryMessage[] {
  const relevant = messages.filter((message) => message.role === "user" || message.role === "assistant");
  const last = relevant[relevant.length - 1];
  const trimmed = last && last.role === "user" && last.content === currentMessage ? relevant.slice(0, -1) : relevant;
  return trimmed.map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));
}

export async function loadTutorContext(state: Pick<TutorStateType, "userId" | "sessionId" | "message">) {
  const [profile, memories, sessionMessages, progress] = await Promise.all([
    getProfile(state.userId),
    listMemories(state.userId),
    listSessionMessagesForUser(state.userId, state.sessionId),
    computeProgressSummary(state.userId).catch(() => ({ weakAreas: [] as string[], dueCards: 0 }))
  ]);

  return {
    profile,
    memories,
    memoryContext: formatMemoryContext(memories),
    history: historyFromMessages(sessionMessages, state.message),
    weakAreas: progress.weakAreas,
    dueCards: progress.dueCards
  };
}

export async function resolvePlanFocus(state: { userId: string; planSnippet?: string }) {
  if (state.planSnippet) return state.planSnippet;
  try {
    const today = await getTodayPlanFocus(state.userId);
    return today?.focus;
  } catch {
    return undefined;
  }
}

export async function runTutorResponseNode(state: TutorStateType) {
  const sink = getStreamSink(state.runId);
  const result = await generateTutorResponse({
    message: state.message,
    intent: state.intent,
    history: state.history ?? [],
    memoryContext: state.memoryContext ?? [],
    profile: state.profile,
    planFocus: state.planFocus,
    weakAreas: state.weakAreas,
    dueCards: state.dueCards,
    verifyMode: state.verifyMode,
    modelSelectionMode: state.modelSelectionMode,
    customModel: state.customModel,
    modelPreferences: state.profile
      ? {
        preferredSimpleModel: state.profile.preferredSimpleModel,
        preferredComplexModel: state.profile.preferredComplexModel
      }
      : undefined,
    onDelta: sink?.onDelta
  });

  sink?.onStructured?.(result.structured);

  return {
    structured: result.structured,
    model: result.model,
    nodesExecuted: ["TutorResponse"],
    agentRuns: [{
      nodeName: "TutorResponse",
      model: result.model,
      tokens: result.usage.totalTokens,
      costUsd: result.costUsd,
      latencyMs: result.latencyMs
    }]
  };
}

export async function runLearningPersistNode(state: TutorStateType) {
  const structured = state.structured;
  if (!structured) return { createdReviewCards: 0, nodesExecuted: ["SRSExtract"], agentRuns: [] as AgentRunSummary[] };

  const started = Date.now();
  const reviewItems = deriveReviewItems(structured, state.message, state.saveToReview);
  const context = { examples: structured.examples, tags: structured.topic ? [structured.topic] : [] };

  const cards = await addSrsCards(state.userId, reviewItems, context);
  await addVocabItems(state.userId, reviewItems, state.sessionId);
  try {
    await addGrammarPoints(state.userId, structured.grammarPoints ?? []);
  } catch (error) {
    console.error("Failed to persist grammar points", error);
  }

  return {
    createdReviewCards: cards.length,
    nodesExecuted: ["SRSExtract"],
    agentRuns: [{ nodeName: "SRSExtract", tokens: 0, costUsd: 0, latencyMs: Date.now() - started }]
  };
}

export async function runMemoryCuratorNode(state: TutorStateType) {
  const structured = state.structured;
  if (!structured) return { memoriesSaved: [] as MemoryItem[], nodesExecuted: ["MemoryWrite"], agentRuns: [] as AgentRunSummary[] };

  const result = await curateMemories({
    userId: state.userId,
    message: state.message,
    answer: structured.answer,
    existing: state.memories ?? [],
    profile: state.profile
  });

  return {
    memoriesSaved: result.saved,
    nodesExecuted: ["MemoryWrite"],
    agentRuns: result.usage
      ? [{
        nodeName: "MemoryCurator",
        model: result.model,
        tokens: result.usage.totalTokens,
        costUsd: result.costUsd ?? 0,
        latencyMs: result.latencyMs ?? 0
      }]
      : []
  };
}

async function compileTutorGraph() {
  const checkpointer = await getCheckpointer();

  const graph = new StateGraph(TutorState)
    .addNode("contextLoader", async (state) => ({
      ...(await loadTutorContext(state)),
      nodesExecuted: ["ContextLoader", "MemoryRetrieve"]
    }))
    .addNode("planner", async (state) => ({
      planFocus: await resolvePlanFocus(state),
      nodesExecuted: ["Planner"]
    }))
    .addNode("tutorResponse", runTutorResponseNode)
    .addNode("learningPersist", runLearningPersistNode)
    .addNode("memoryCurator", runMemoryCuratorNode)
    .addEdge(START, "contextLoader")
    .addEdge("contextLoader", "planner")
    .addEdge("planner", "tutorResponse")
    .addEdge("tutorResponse", "learningPersist")
    .addEdge("tutorResponse", "memoryCurator")
    .addEdge("learningPersist", END)
    .addEdge("memoryCurator", END)
    .compile({
      checkpointer,
      name: "mandarin_tutor_v0_2"
    });

  return graph;
}

let compiledGraphPromise: ReturnType<typeof compileTutorGraph> | null = null;

async function getCompiledGraph() {
  if (!compiledGraphPromise) {
    compiledGraphPromise = compileTutorGraph();
  }

  return compiledGraphPromise;
}

export async function runTutorGraphWithLangGraph(input: LangGraphInput): Promise<LangGraphOutput> {
  const graph = await getCompiledGraph();

  const result = await graph.invoke(
    {
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
      structured: undefined,
      createdReviewCards: 0,
      memoriesSaved: []
    },
    {
      configurable: {
        thread_id: input.sessionId,
        checkpoint_ns: "tutor"
      }
    }
  );

  const output = result as Partial<TutorStateType>;

  if (!output.structured) {
    throw new Error("LangGraph run returned no structured tutor output");
  }

  return {
    structured: output.structured,
    memoryContext: output.memoryContext ?? [],
    nodesExecuted: [...(output.nodesExecuted ?? []), "SafetyQualityGate", "PersistTelemetry"],
    createdReviewCards: output.createdReviewCards ?? 0,
    memoriesSaved: output.memoriesSaved ?? [],
    agentRuns: output.agentRuns ?? [],
    model: output.model
  };
}
