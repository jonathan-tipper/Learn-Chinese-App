import type { TutorStructuredResponse } from "@/lib/types";
import { listMemories, synthesizeTutorResponse } from "@/server/store/inMemory";

export interface GraphInput {
  userId: string;
  sessionId: string;
  message: string;
}

export interface GraphOutput {
  structured: TutorStructuredResponse;
  memoryContext: string[];
  nodesExecuted: string[];
}

/**
 * v0.1 placeholder graph runner.
 * Replace with LangGraph runtime + checkpointer in production deployment.
 */
export async function runTutorGraph(input: GraphInput): Promise<GraphOutput> {
  const nodesExecuted: string[] = [];

  nodesExecuted.push("ContextLoader");
  const memoryContext = listMemories(input.userId).slice(0, 5).map((m) => `${m.key}: ${m.value}`);

  nodesExecuted.push("MemoryRetrieve");
  nodesExecuted.push("Planner");

  nodesExecuted.push("TutorResponse");
  const structured = synthesizeTutorResponse(input.message);

  nodesExecuted.push("SRSExtract");
  nodesExecuted.push("MemoryWrite");
  nodesExecuted.push("SafetyQualityGate");
  nodesExecuted.push("PersistTelemetry");

  return { structured, memoryContext, nodesExecuted };
}
