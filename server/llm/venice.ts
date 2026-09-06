import { env, isVeniceEnabled } from "@/lib/env";

/**
 * Thin, provider-aware client for Venice's OpenAI-compatible chat API.
 *
 * Why this exists: the app previously issued raw `fetch` calls from several places and
 * had to work around Venice quirks (answers landing in `reasoning_content`, the injected
 * Venice system prompt inflating token counts, reasoning models doubling latency).
 * Centralising those concerns gives every agent the same behaviour, real token usage,
 * cost estimates, and a streaming path.
 */

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type ReasoningLevel = "none" | "low" | "medium" | "high";

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Ask for a JSON object response. */
  json?: boolean;
  /** Defaults to "none": tutoring calls do not benefit from hidden reasoning and it doubles latency. */
  reasoning?: ReasoningLevel;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
  usage: TokenUsage;
  latencyMs: number;
  finishReason?: string;
  /** True when the answer had to be recovered from `reasoning_content`. */
  recoveredFromReasoning?: boolean;
}

export class VeniceError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "VeniceError";
    this.status = status;
  }
}

type VeniceContent = string | Array<string | { text?: unknown; type?: unknown }> | null | undefined;

type VeniceChatPayload = {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: VeniceContent;
      reasoning_content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: unknown;
};

type VeniceStreamChunk = {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    delta?: {
      content?: VeniceContent;
      reasoning_content?: unknown;
    };
  }>;
  usage?: VeniceChatPayload["usage"];
};

/** USD per 1M tokens (input, output). Used only for spend estimates in agent_runs. */
const MODEL_PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
  "zai-org-glm-4.7": { input: 0.55, output: 2.65 },
  "zai-org-glm-4.7-flash": { input: 0.06, output: 0.4 },
  "zai-org-glm-5": { input: 1, output: 3.2 },
  "z-ai-glm-5-3-flash": { input: 0.15, output: 0.5 },
  "qwen3-235b-a22b-instruct-2507": { input: 0.15, output: 0.75 },
  "qwen3-6-27b": { input: 0.325, output: 3.25 },
  "google-gemma-4-31b-it": { input: 0.12, output: 0.36 },
  "mistral-small-2603": { input: 0.1875, output: 0.75 },
  "gemini-3-5-flash-lite": { input: 0.375, output: 3.125 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 }
};

const DEFAULT_PRICING = { input: 1, output: 3 };

export function estimateModelCostUsd(model: string, usage: TokenUsage) {
  const pricing = MODEL_PRICING_PER_MILLION[model] ?? DEFAULT_PRICING;
  const cost = (usage.promptTokens / 1_000_000) * pricing.input + (usage.completionTokens / 1_000_000) * pricing.output;
  return Number(cost.toFixed(6));
}

function flattenContent(content: VeniceContent): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  return "";
}

function normalizeUsage(usage: VeniceChatPayload["usage"], fallbackText?: { prompt: string; completion: string }): TokenUsage {
  const promptTokens = usage?.prompt_tokens ?? (fallbackText ? Math.ceil(fallbackText.prompt.length / 4) : 0);
  const completionTokens = usage?.completion_tokens ?? (fallbackText ? Math.ceil(fallbackText.completion.length / 4) : 0);
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage?.total_tokens ?? promptTokens + completionTokens
  };
}

function buildRequestBody(options: ChatCompletionOptions, stream: boolean) {
  const reasoning = options.reasoning ?? "none";
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.3,
    stream,
    venice_parameters: {
      // The default Venice system prompt adds ~1k tokens per call and fights our own instructions.
      include_venice_system_prompt: false,
      ...(reasoning === "none" ? { disable_thinking: true, strip_thinking_response: true } : {})
    }
  };

  if (options.maxTokens) body.max_tokens = options.maxTokens;
  if (options.json) body.response_format = { type: "json_object" };
  if (reasoning !== "none") body.reasoning_effort = reasoning;
  if (stream) body.stream_options = { include_usage: true };

  return body;
}

function assertEnabled() {
  if (!isVeniceEnabled()) {
    throw new VeniceError("Venice API key is required. Set VENICE_API_KEY.", 503);
  }
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  return AbortSignal.any([signal, timeout]);
}

async function postChat(options: ChatCompletionOptions, stream: boolean) {
  assertEnabled();
  const response = await fetch(`${env.veniceBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.veniceApiKey}`
    },
    body: JSON.stringify(buildRequestBody(options, stream)),
    signal: withTimeout(options.signal, options.timeoutMs ?? 90_000)
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 300);
    } catch {
      // ignore body read failures
    }
    throw new VeniceError(`Venice request failed (${response.status})${detail ? `: ${detail}` : ""}`, response.status);
  }

  return response;
}

function promptText(messages: ChatMessage[]) {
  return messages.map((message) => message.content).join("\n");
}

/**
 * Non-streaming completion. Recovers gracefully when a reasoning model returns its
 * answer inside `reasoning_content` instead of `content`.
 */
export async function chatComplete(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const started = Date.now();
  const response = await postChat(options, false);
  const payload = (await response.json()) as VeniceChatPayload;
  const choice = payload.choices?.[0];
  let content = flattenContent(choice?.message?.content).trim();
  let recoveredFromReasoning = false;

  if (!content) {
    const reasoning = choice?.message?.reasoning_content;
    if (typeof reasoning === "string" && reasoning.trim()) {
      content = reasoning.trim();
      recoveredFromReasoning = true;
    }
  }

  if (!content) {
    throw new VeniceError("Venice response missing content", 502);
  }

  return {
    content,
    model: payload.model ?? options.model,
    usage: normalizeUsage(payload.usage, { prompt: promptText(options.messages), completion: content }),
    latencyMs: Date.now() - started,
    finishReason: choice?.finish_reason,
    recoveredFromReasoning
  };
}

/** Parse an SSE body incrementally, invoking `onData` for each `data:` payload. */
async function readSseStream(body: ReadableStream<Uint8Array>, onData: (data: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      for (const line of rawEvent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        onData(trimmed.slice(5).trim());
      }
      separatorIndex = buffer.indexOf("\n\n");
    }

    if (done) break;
  }

  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    onData(tail.slice(5).trim());
  }
}

/**
 * Streaming completion. `onDelta` receives content tokens as they arrive.
 * Falls back to a non-streaming call when the provider returns a plain JSON body
 * (some proxies and the test mocks do this) or when the stream yields no content.
 */
export async function streamChatComplete(
  options: ChatCompletionOptions,
  onDelta: (text: string) => void
): Promise<ChatCompletionResult> {
  const started = Date.now();
  const response = await postChat(options, true);
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.body || !contentType.includes("text/event-stream")) {
    const payload = (await response.json()) as VeniceChatPayload;
    const choice = payload.choices?.[0];
    let content = flattenContent(choice?.message?.content).trim();
    let recoveredFromReasoning = false;
    if (!content && typeof choice?.message?.reasoning_content === "string") {
      content = choice.message.reasoning_content.trim();
      recoveredFromReasoning = true;
    }
    if (!content) throw new VeniceError("Venice response missing content", 502);
    onDelta(content);
    return {
      content,
      model: payload.model ?? options.model,
      usage: normalizeUsage(payload.usage, { prompt: promptText(options.messages), completion: content }),
      latencyMs: Date.now() - started,
      finishReason: choice?.finish_reason,
      recoveredFromReasoning
    };
  }

  let content = "";
  let reasoningContent = "";
  let model = options.model;
  let finishReason: string | undefined;
  let usage: VeniceChatPayload["usage"];

  await readSseStream(response.body, (data) => {
    if (!data || data === "[DONE]") return;
    let chunk: VeniceStreamChunk;
    try {
      chunk = JSON.parse(data) as VeniceStreamChunk;
    } catch {
      return;
    }
    if (chunk.model) model = chunk.model;
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = flattenContent(choice.delta?.content);
    if (delta) {
      content += delta;
      onDelta(delta);
    } else if (typeof choice.delta?.reasoning_content === "string") {
      reasoningContent += choice.delta.reasoning_content;
    }
  });

  let recoveredFromReasoning = false;
  if (!content.trim() && reasoningContent.trim()) {
    content = reasoningContent.trim();
    recoveredFromReasoning = true;
    onDelta(content);
  }

  if (!content.trim()) {
    throw new VeniceError("Venice stream produced no content", 502);
  }

  return {
    content,
    model,
    usage: normalizeUsage(usage, { prompt: promptText(options.messages), completion: content }),
    latencyMs: Date.now() - started,
    finishReason,
    recoveredFromReasoning
  };
}

/** Extract the first JSON object from a model reply that may include fences or prose. */
export function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim().startsWith("{")) return fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return text;
}

export function parseJsonObject<T = Record<string, unknown>>(text: string): T {
  return JSON.parse(extractJsonObject(text)) as T;
}
