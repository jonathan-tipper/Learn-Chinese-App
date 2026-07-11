export interface SessionBudgetConfig {
  enabled: boolean;
  maxTokens: number;
  warningRatio: number;
  estimatedUsdPer1kTokens: number;
}

export type SessionBudgetStatus = "allow" | "warn" | "limit";

export interface SessionBudgetDecision {
  status: SessionBudgetStatus;
  currentTokens: number;
  estimatedNextTokens: number;
  projectedTokens: number;
  maxTokens: number;
  estimatedProjectedCostUsd: number;
}

const defaults: SessionBudgetConfig = {
  enabled: true,
  maxTokens: 12_000,
  warningRatio: 0.8,
  estimatedUsdPer1kTokens: 0.001
};

function parsePositiveNumber(
  source: Record<string, string | undefined>,
  key: string,
  fallback: number,
  production: boolean,
  maximum = Number.POSITIVE_INFINITY
) {
  const raw = source[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (Number.isFinite(value) && value > 0 && value <= maximum) return value;
  if (production) throw new Error(`${key} must be a positive number${Number.isFinite(maximum) ? ` no greater than ${maximum}` : ""}.`);
  return fallback;
}

function parseBoolean(raw: string | undefined, fallback: boolean) {
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw.trim().toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(raw.trim().toLowerCase())) return false;
  return fallback;
}

export function parseSessionBudgetConfig(
  source: Record<string, string | undefined> = process.env,
  nodeEnv = process.env.NODE_ENV
): SessionBudgetConfig {
  const production = nodeEnv === "production";
  return {
    enabled: parseBoolean(source.SESSION_BUDGET_ENABLED, defaults.enabled),
    maxTokens: Math.round(parsePositiveNumber(source, "SESSION_BUDGET_MAX_TOKENS", defaults.maxTokens, production)),
    warningRatio: parsePositiveNumber(source, "SESSION_BUDGET_WARNING_RATIO", defaults.warningRatio, production, 1),
    estimatedUsdPer1kTokens: parsePositiveNumber(
      source,
      "SESSION_BUDGET_ESTIMATED_USD_PER_1K_TOKENS",
      defaults.estimatedUsdPer1kTokens,
      production
    )
  };
}

export function estimateTokens(text: string, reservedOutputTokens = 800) {
  return Math.max(1, Math.ceil(text.length / 4)) + reservedOutputTokens;
}

export function estimateCostUsd(tokens: number, config: SessionBudgetConfig) {
  return Number(((tokens / 1_000) * config.estimatedUsdPer1kTokens).toFixed(6));
}

export function evaluateSessionBudget(
  config: SessionBudgetConfig,
  currentTokens: number,
  estimatedNextTokens: number
): SessionBudgetDecision {
  const projectedTokens = currentTokens + estimatedNextTokens;
  const status: SessionBudgetStatus = !config.enabled
    ? "allow"
    : projectedTokens > config.maxTokens
      ? "limit"
      : projectedTokens >= config.maxTokens * config.warningRatio
        ? "warn"
        : "allow";

  return {
    status,
    currentTokens,
    estimatedNextTokens,
    projectedTokens,
    maxTokens: config.maxTokens,
    estimatedProjectedCostUsd: estimateCostUsd(projectedTokens, config)
  };
}
