import { describe, expect, it } from "vitest";
import {
  evaluateSessionBudget,
  parseSessionBudgetConfig
} from "@/lib/session-budget";

describe("session budget guardrails", () => {
  it("uses safe defaults when overrides are absent", () => {
    expect(parseSessionBudgetConfig({}, "development")).toEqual({
      enabled: true,
      maxTokens: 12_000,
      warningRatio: 0.8,
      estimatedUsdPer1kTokens: 0.001
    });
  });

  it("parses documented environment overrides", () => {
    expect(parseSessionBudgetConfig({
      SESSION_BUDGET_ENABLED: "false",
      SESSION_BUDGET_MAX_TOKENS: "24000",
      SESSION_BUDGET_WARNING_RATIO: "0.75",
      SESSION_BUDGET_ESTIMATED_USD_PER_1K_TOKENS: "0.004"
    }, "production")).toEqual({
      enabled: false,
      maxTokens: 24_000,
      warningRatio: 0.75,
      estimatedUsdPer1kTokens: 0.004
    });
  });

  it("falls back in development but rejects invalid production config", () => {
    expect(parseSessionBudgetConfig({ SESSION_BUDGET_MAX_TOKENS: "nope" }, "development").maxTokens)
      .toBe(12_000);
    expect(() => parseSessionBudgetConfig({ SESSION_BUDGET_MAX_TOKENS: "nope" }, "production"))
      .toThrow("SESSION_BUDGET_MAX_TOKENS");
  });

  it("allows, warns, and limits based on cumulative estimated usage", () => {
    const config = {
      enabled: true,
      maxTokens: 1_000,
      warningRatio: 0.8,
      estimatedUsdPer1kTokens: 0.002
    };

    expect(evaluateSessionBudget(config, 100, 200)).toMatchObject({ status: "allow", projectedTokens: 300 });
    expect(evaluateSessionBudget(config, 650, 200)).toMatchObject({ status: "warn", projectedTokens: 850 });
    expect(evaluateSessionBudget(config, 900, 200)).toMatchObject({ status: "limit", projectedTokens: 1_100 });
  });
});
