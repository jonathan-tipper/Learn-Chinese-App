import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseAuthEnabled, isSupabaseStoreEnabled } from "@/lib/env";

let serviceClient: SupabaseClient | null = null;
let authClient: SupabaseClient | null = null;

export function getSupabaseServiceClient(): SupabaseClient {
  if (!isSupabaseStoreEnabled()) {
    throw new Error("Supabase store is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  if (!serviceClient) {
    serviceClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  return serviceClient;
}

export function getSupabaseAuthClient(): SupabaseClient {
  if (!isSupabaseAuthEnabled()) {
    throw new Error("Supabase auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  if (!authClient) {
    const key = env.supabaseAnonKey || env.supabaseServiceRoleKey;
    authClient = createClient(env.supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  return authClient;
}
