export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  supabaseDbSchema: process.env.SUPABASE_DB_SCHEMA ?? "learn_chinese",
  langGraphPostgresUrl: process.env.LANGGRAPH_POSTGRES_URL ?? "",
  veniceApiKey: process.env.VENICE_API_KEY ?? "",
  veniceBaseUrl: process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1",
  veniceSimpleModel: process.env.VENICE_SIMPLE_MODEL ?? "zai-org-glm-4.7",
  veniceComplexModel: process.env.VENICE_COMPLEX_MODEL ?? "zai-org-glm-5",
  veniceTtsModel: process.env.VENICE_TTS_MODEL ?? "tts-kokoro",
  veniceTtsVoice: process.env.VENICE_TTS_VOICE ?? "zf_xiaobei",
  // Embedding model for semantic memory search (must output 1536-dim vectors).
  // Leave unset to disable embeddings and fall back to recency-based retrieval.
  veniceEmbeddingModel: process.env.VENICE_EMBEDDING_MODEL ?? "",
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "",
} as const;

export function isSupabaseStoreEnabled() {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

export function isSupabaseAuthEnabled() {
  return Boolean(env.supabaseUrl && (env.supabaseAnonKey || env.supabaseServiceRoleKey));
}

export function isVeniceEnabled() {
  return Boolean(env.veniceApiKey);
}

export function isPushEnabled() {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject);
}

export function isDevAuthFallbackEnabled() {
  const raw = process.env.ALLOW_DEV_AUTH_FALLBACK?.trim().toLowerCase();
  if (!raw) {
    return process.env.NODE_ENV !== "production";
  }

  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }

  return process.env.NODE_ENV !== "production";
}
