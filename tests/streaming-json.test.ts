import { describe, expect, it } from "vitest";
import { createJsonStringFieldStreamer } from "@/lib/streaming-json";

function streamInChunks(text: string, size: number, field = "answer") {
  const deltas: string[] = [];
  const streamer = createJsonStringFieldStreamer(field, (delta) => deltas.push(delta));
  for (let i = 0; i < text.length; i += size) {
    streamer.push(text.slice(i, i + size));
  }
  return { deltas, streamer };
}

describe("createJsonStringFieldStreamer", () => {
  const json = JSON.stringify({
    answer: "你好 (nǐ hǎo) means \"hello\".\nUse it any time of day.",
    keyPoints: ["Tone 3 + tone 3 changes to tone 2 + tone 3"],
    examples: ["你好吗？ (Nǐ hǎo ma?) — How are you?"]
  });

  it("streams the answer field regardless of chunk boundaries", () => {
    for (const size of [1, 2, 3, 7, 50, 1000]) {
      const { deltas, streamer } = streamInChunks(json, size);
      expect(deltas.join("")).toBe("你好 (nǐ hǎo) means \"hello\".\nUse it any time of day.");
      expect(streamer.done).toBe(true);
      expect(streamer.value).toBe(deltas.join(""));
    }
  });

  it("stops emitting after the target field closes", () => {
    const { deltas } = streamInChunks(json, 5);
    expect(deltas.join("")).not.toContain("keyPoints");
  });

  it("decodes unicode escapes split across chunks", () => {
    const text = '{"answer":"caf\\u00e9 \\u4f60\\u597d"}';
    for (const size of [1, 3, 4]) {
      const { deltas } = streamInChunks(text, size);
      expect(deltas.join("")).toBe("café 你好");
    }
  });

  it("ignores the key when it appears inside another string value", () => {
    const text = '{"note":"the \\"answer\\" is later","answer":"real"}';
    const { deltas } = streamInChunks(text, 4);
    expect(deltas.join("")).toBe("real");
  });

  it("handles fenced output and leading prose", () => {
    const text = "Here you go:\n```json\n{\n  \"answer\": \"谢谢 (xièxie) — thank you\"\n}\n```";
    const { deltas } = streamInChunks(text, 6);
    expect(deltas.join("")).toBe("谢谢 (xièxie) — thank you");
  });

  it("finishes without emitting for non-string values", () => {
    const { deltas, streamer } = streamInChunks('{"answer": 42}', 3);
    expect(deltas).toEqual([]);
    expect(streamer.done).toBe(true);
  });
});
