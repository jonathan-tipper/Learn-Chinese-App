/**
 * Supabase/PostgREST error helpers. New tables ship as migrations that may lag the code,
 * so optional features degrade instead of failing the whole request.
 */
export function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  // 42P01 undefined_table, 42703 undefined_column, PGRST204/205 PostgREST schema-cache misses.
  if (code === "PGRST205" || code === "PGRST204" || code === "42P01" || code === "42703") return true;
  if (typeof message === "string") {
    return /could not find the table|relation .* does not exist|column .* does not exist|schema cache|could not find the .* column/i.test(message);
  }
  return false;
}

const warned = new Set<string>();

export function warnOnceMissingRelation(name: string, error: unknown) {
  if (warned.has(name)) return;
  warned.add(name);
  const message = error instanceof Error ? error.message : (error as { message?: string })?.message ?? String(error);
  console.warn(`[store] ${name} unavailable — apply the latest supabase/migrations. (${message})`);
}
