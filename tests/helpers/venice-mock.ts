import { vi } from "vitest";

export const tutorStructured = {
  answer: "To order tea politely say 请给我一杯茶 (qǐng gěi wǒ yì bēi chá) — please give me a cup of tea.",
  keyPoints: ["请 (qǐng) softens any request"],
  examples: ["请给我一杯茶。 (Qǐng gěi wǒ yì bēi chá.) — Please give me a cup of tea.", "我想喝茶。 (Wǒ xiǎng hē chá.) — I want to drink tea."],
  microExercise: "Order a coffee instead of tea using the same pattern.",
  suggestedReviewItems: ["茶 (chá) - tea", "请 (qǐng) - please"],
  grammarPoints: [],
  topic: "ordering drinks"
};

export const plannerPayload = {
  rationale: "You want to order food and talk to family, so the week alternates restaurant phrases with home routines.",
  items: Array.from({ length: 7 }, (_, index) => ({
    day: index + 1,
    title: index === 6 ? "Weekly review" : `Focus day ${index + 1}`,
    canDo: index === 0 ? "order a drink politely" : `I can do task ${index + 1}`,
    lessonFocus: `Lesson focus ${index + 1}.`,
    reviewFocus: "Due cards",
    modalities: ["speaking", "review"],
    reason: "Matches your restaurant goal.",
    estimatedMinutes: 10
  }))
};

export const curatorPayload = {
  memories: [
    { type: "topic", key: "Toddler at home", value: "Has a toddler and wants bedtime and bath phrases." }
  ]
};

export const characterCardPayload = {
  pinyin: "chá",
  meaning: "tea",
  characters: [{
    hanzi: "茶",
    pinyin: "chá",
    meaning: "tea",
    radical: "艹",
    radicalMeaning: "grass / plant",
    components: "Grass on top, a person in the middle, a tree below: a plant people pick from trees.",
    mnemonic: "A person standing between grass and a tree, plucking leaves for tea.",
    strokeCount: 9
  }],
  commonWords: [
    { hanzi: "茶", pinyin: "chá", english: "tea" },
    { hanzi: "绿茶", pinyin: "lǜchá", english: "green tea" },
    { hanzi: "茶杯", pinyin: "chábēi", english: "teacup" }
  ],
  exampleSentence: { hanzi: "我想喝茶。", pinyin: "Wǒ xiǎng hē chá.", english: "I want to drink tea." },
  usageTip: "喝茶 (drink tea) is the natural collocation; 吃茶 is dialectal."
};

type Options = {
  stream?: boolean;
  onCall?: (body: Record<string, unknown>) => void;
  tutor?: unknown;
};

function sseBody(content: string, usage: Record<string, number>) {
  const chunks: string[] = [];
  const size = 7;
  chunks.push(`data: ${JSON.stringify({ choices: [{ delta: { role: "assistant", content: "" } }] })}\n\n`);
  for (let i = 0; i < content.length; i += size) {
    chunks.push(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(i, i + size) } }] })}\n\n`);
  }
  chunks.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage })}\n\n`);
  chunks.push("data: [DONE]\n\n");
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
}

/**
 * Route Venice chat completions by prompt so one mock serves the tutor, planner,
 * memory curator, summarizer, and character card agents.
 */
export function installVeniceMock(options: Options = {}) {
  const calls: Array<Record<string, unknown>> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes("/chat/completions")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push(body);
      options.onCall?.(body);
      const messages = (body.messages as Array<{ role: string; content: string }>) ?? [];
      const text = messages.map((message) => message.content).join("\n");
      const usage = { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 };

      let content: string;
      if (text.includes("Design the next 7 days")) content = JSON.stringify(plannerPayload);
      else if (text.includes("long-term memory of a Mandarin coaching app")) content = JSON.stringify(curatorPayload);
      else if (text.includes("past-tense summaries")) content = "Practised ordering tea politely with 请 (qǐng) and 茶 (chá).";
      else if (text.includes("Create a learning card")) content = JSON.stringify(characterCardPayload);
      else content = JSON.stringify(options.tutor ?? tutorStructured);

      if (body.stream === true && options.stream !== false) {
        return new Response(sseBody(content, usage), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" }
        });
      }

      return new Response(
        JSON.stringify({ model: body.model, choices: [{ message: { content } }], usage }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.endsWith("/models")) {
      return new Response(JSON.stringify({ data: [{ id: "zai-org-glm-4.7" }, { id: "zai-org-glm-5" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.includes("/audio/speech")) {
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
    }

    throw new Error(`Unexpected external fetch in test: ${url}`);
  });

  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock, calls };
}

export function parseSseEvents(raw: string) {
  return raw
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => chunk.replace(/^data:\s*/, ""))
    .map((chunk) => JSON.parse(chunk) as Record<string, unknown> & { type: string });
}
