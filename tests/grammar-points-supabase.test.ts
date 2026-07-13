import { beforeEach, describe, expect, it, vi } from "vitest";

type GrammarRow = {
  id: string;
  user_id: string;
  title: string;
  explanation: string;
  examples_json: string[];
  created_at: string;
};

const database = vi.hoisted(() => ({ rows: [] as GrammarRow[] }));

vi.mock("@/lib/supabase", () => {
  class Query {
    private operation: "select" | "insert" | "update" = "select";
    private payload: Partial<GrammarRow> = {};
    private filters = new Map<string, unknown>();

    select() {
      return this;
    }

    insert(payload: Partial<GrammarRow>) {
      this.operation = "insert";
      this.payload = payload;
      return this;
    }

    update(payload: Partial<GrammarRow>) {
      this.operation = "update";
      this.payload = payload;
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.set(column, value);
      return this;
    }

    order() {
      return this;
    }

    private matches(row: GrammarRow) {
      return Array.from(this.filters).every(([column, value]) => row[column as keyof GrammarRow] === value);
    }

    private execute() {
      if (this.operation === "insert") {
        const row = {
          ...this.payload,
          created_at: "2026-07-13T20:00:00.000Z"
        } as GrammarRow;
        database.rows.push(row);
        return row;
      }

      if (this.operation === "update") {
        const row = database.rows.find((candidate) => this.matches(candidate));
        if (!row) return null;
        Object.assign(row, this.payload);
        return row;
      }

      return database.rows.filter((row) => this.matches(row));
    }

    async returns<T>() {
      return { data: this.execute() as T, error: null };
    }

    async maybeSingle<T>() {
      return { data: this.execute() as T, error: null };
    }
  }

  return {
    getSupabaseServiceClient: () => ({
      schema: () => ({
        from: (table: string) => {
          if (table !== "grammar_points") throw new Error(`Unexpected table: ${table}`);
          return new Query();
        }
      })
    })
  };
});

import { addGrammarPoints, listGrammarPoints } from "@/server/store/supabase";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";

describe("Supabase grammar point store", () => {
  beforeEach(() => {
    database.rows.length = 0;
  });

  it("creates, updates, and lists only the requested user's records", async () => {
    const [created] = await addGrammarPoints(userId, [{
      title: "把 construction",
      explanation: "Use 把 before the object.",
      examples: ["我把茶喝完了。"],
      confidence: "high"
    }]);

    database.rows.push({
      id: "33333333-3333-4333-8333-333333333333",
      user_id: otherUserId,
      title: "把 construction",
      explanation: "Other user's record.",
      examples_json: [],
      created_at: "2026-07-13T20:00:00.000Z"
    });

    const [updated] = await addGrammarPoints(userId, [{
      title: " 把   CONSTRUCTION ",
      explanation: "Use 把 to foreground how an object is affected.",
      examples: ["我把作业做完了。"],
      confidence: "high"
    }]);

    expect(updated.id).toBe(created.id);
    expect(await listGrammarPoints(userId)).toEqual([
      expect.objectContaining({
        userId,
        explanation: "Use 把 to foreground how an object is affected.",
        examples: ["我把作业做完了。"]
      })
    ]);
    expect(await listGrammarPoints(otherUserId)).toEqual([
      expect.objectContaining({ userId: otherUserId, explanation: "Other user's record." })
    ]);
  });
});
