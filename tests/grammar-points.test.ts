import { beforeEach, describe, expect, it } from "vitest";
import { normalizeGrammarPointSignals, grammarPointIdentity } from "@/lib/grammar-points";
import { addGrammarPoints, listGrammarPoints } from "@/server/store";
import { resetInMemoryStore } from "@/server/store/inMemory";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";

describe("grammar point normalization", () => {
  it("keeps only explicit high-confidence grammar signals", () => {
    expect(normalizeGrammarPointSignals([
      {
        title: "  把 construction  ",
        explanation: "  Use 把 before the object when emphasizing disposal or effect.  ",
        examples: ["我把茶喝完了。", "  我把茶喝完了。  ", ""],
        confidence: "high"
      },
      {
        title: "Maybe a result complement",
        explanation: "This might be a result complement.",
        examples: [],
        confidence: "low"
      },
      { title: "Missing explanation", confidence: "high" },
      "malformed"
    ])).toEqual([
      {
        title: "把 construction",
        explanation: "Use 把 before the object when emphasizing disposal or effect.",
        examples: ["我把茶喝完了。"],
        confidence: "high"
      }
    ]);

    expect(normalizeGrammarPointSignals(undefined)).toEqual([]);
    expect(normalizeGrammarPointSignals({ title: "not an array" })).toEqual([]);
  });

  it("uses a conservative whitespace-and-case identity", () => {
    expect(grammarPointIdentity("  把   Construction ")).toBe(grammarPointIdentity("把 construction"));
    expect(grammarPointIdentity("把 construction")).not.toBe(grammarPointIdentity("被 construction"));
  });
});

describe("in-memory grammar point store", () => {
  beforeEach(() => resetInMemoryStore());

  it("creates, updates, and lists grammar points per user", async () => {
    const [created] = await addGrammarPoints(userId, [{
      title: "把 construction",
      explanation: "Use 把 before the object.",
      examples: ["我把茶喝完了。"],
      confidence: "high"
    }]);

    const [updated] = await addGrammarPoints(userId, [{
      title: "  把   CONSTRUCTION ",
      explanation: "Use 把 before an object to foreground how it is affected.",
      examples: ["我把作业做完了。"],
      confidence: "high"
    }]);

    expect(updated.id).toBe(created.id);
    expect(await listGrammarPoints(userId)).toEqual([
      expect.objectContaining({
        id: created.id,
        userId,
        title: "把 construction",
        explanation: "Use 把 before an object to foreground how it is affected.",
        examples: ["我把作业做完了。"]
      })
    ]);
    expect(await listGrammarPoints(otherUserId)).toEqual([]);
  });
});
