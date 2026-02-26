import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { env } from "@/lib/env";
import type { TutorStructuredResponse } from "@/lib/types";
import { generateTutorStructuredResponse } from "@/server/agents/tutorModel";
import { getProfile, listMemories, listSessionMessages, searchMemoriesBySimilarity } from "@/server/store";
import type { ModelSelectionMode } from "@/lib/venice";

export interface LangGraphInput {
  userId: string;
  sessionId: string;
  message: string;
  intent?: string;
  verifyMode?: boolean;
  modelSelectionMode?: ModelSelectionMode;
  customModel?: string;
}

export interface LangGraphOutput {
  structured: TutorStructuredResponse;
  memoryContext: string[];
  nodesExecuted: string[];
}

const TutorState = Annotation.Root({
  userId: Annotation<string>(),
  sessionId: Annotation<string>(),
  message: Annotation<string>(),
  intent: Annotation<string | undefined>(),
  verifyMode: Annotation<boolean | undefined>(),
  modelSelectionMode: Annotation<ModelSelectionMode | undefined>(),
  customModel: Annotation<string | undefined>(),
  profileSummary: Annotation<string>(),
  preferredSimpleModel: Annotation<string | undefined>(),
  preferredComplexModel: Annotation<string | undefined>(),
  memoryContext: Annotation<string[]>(),
  recentUserMessages: Annotation<string[]>(),
  structured: Annotation<TutorStructuredResponse>(),
  nodesExecuted: Annotation<string[]>()
});

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

async function compileTutorGraph() {
  const checkpointer = await getCheckpointer();

  const graph = new StateGraph(TutorState)
    .addNode("contextLoader", async (state) => {
      const [profile, semanticMemories, sessionMessages] = await Promise.all([
        getProfile(state.userId),
        searchMemoriesBySimilarity(state.userId, state.message, 5),
        listSessionMessages(state.sessionId)
      ]);

      // Fall back to recency-based retrieval when embeddings are unavailable.
      const memories = semanticMemories.length > 0
        ? semanticMemories
        : (await listMemories(state.userId)).slice(0, 5);

      const memoryContext = memories.map((m) => `${m.key}: ${m.value}`);
      const recentUserMessages = sessionMessages
        .filter((m) => m.role === "user")
        .slice(-3)
        .map((m) => m.content);

      const profileSummary = profile
        ? `level=${profile.level}; goals=${profile.goals.join(", ")}; interests=${profile.interests.join(", ")}; minutesPerDay=${profile.minutesPerDay}; coachStyle=${profile.coachStyle}`
        : "No saved profile yet.";

      return {
        profileSummary,
        preferredSimpleModel: profile?.preferredSimpleModel,
        preferredComplexModel: profile?.preferredComplexModel,
        memoryContext,
        recentUserMessages,
        nodesExecuted: ["ContextLoader", "MemoryRetrieve", "Planner"]
      };
    })
    .addNode("tutorResponse", async (state) => {
      const structured = await generateTutorStructuredResponse({
        message: state.message,
        intent: state.intent,
        memoryContext: state.memoryContext ?? [],
        profileSummary: state.profileSummary,
        recentUserMessages: state.recentUserMessages ?? [],
        verifyMode: state.verifyMode,
        modelSelectionMode: state.modelSelectionMode,
        customModel: state.customModel,
        modelPreferences: {
          preferredSimpleModel: state.preferredSimpleModel,
          preferredComplexModel: state.preferredComplexModel
        }
      });

      return {
        structured,
        nodesExecuted: [
          ...(state.nodesExecuted ?? []),
          "TutorResponse",
          "SRSExtract",
          "MemoryWrite",
          "SafetyQualityGate",
          "PersistTelemetry"
        ]
      };
    })
    .addEdge(START, "contextLoader")
    .addEdge("contextLoader", "tutorResponse")
    .addEdge("tutorResponse", END)
    .compile({
      checkpointer,
      name: "mandarin_tutor_v0_1"
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
      message: input.message,
      intent: input.intent,
      verifyMode: input.verifyMode,
      modelSelectionMode: input.modelSelectionMode,
      customModel: input.customModel,
      nodesExecuted: []
    },
    {
      configurable: {
        thread_id: input.sessionId,
        checkpoint_ns: "tutor"
      }
    }
  );

  const output = result as {
    structured?: TutorStructuredResponse;
    memoryContext?: string[];
    nodesExecuted?: string[];
  };

  if (!output.structured) {
    throw new Error("LangGraph run returned no structured tutor output");
  }

  return {
    structured: output.structured,
    memoryContext: output.memoryContext ?? [],
    nodesExecuted: output.nodesExecuted ?? []
  };
}
