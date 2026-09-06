import type { TutorStructuredResponse } from "@/lib/types";

/**
 * Per-run streaming callbacks. LangGraph state must stay serialisable for the
 * checkpointer, so callbacks are registered out-of-band by run id.
 */
export interface TutorStreamSink {
  onDelta?: (text: string) => void;
  onStructured?: (structured: TutorStructuredResponse) => void;
}

const sinks = new Map<string, TutorStreamSink>();

export function registerStreamSink(runId: string, sink: TutorStreamSink) {
  sinks.set(runId, sink);
}

export function getStreamSink(runId: string | undefined) {
  return runId ? sinks.get(runId) : undefined;
}

export function releaseStreamSink(runId: string | undefined) {
  if (runId) sinks.delete(runId);
}
