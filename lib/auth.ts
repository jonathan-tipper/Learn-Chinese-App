import { isSupabaseAuthEnabled } from "@/lib/env";
import { getSupabaseAuthClient } from "@/lib/supabase";

const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractBearerToken(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function normalizeUserId(candidate: string | null) {
  if (!candidate) return null;
  return UUID_RE.test(candidate) ? candidate : null;
}

export async function getUserIdFromRequest(request: Request): Promise<string> {
  const token = extractBearerToken(request);
  if (token && isSupabaseAuthEnabled()) {
    try {
      const client = getSupabaseAuthClient();
      const { data } = await client.auth.getUser(token);
      const userId = normalizeUserId(data.user?.id ?? null);
      if (userId) {
        return userId;
      }
    } catch {
      // Fall through to header-based development identity.
    }
  }

  return normalizeUserId(request.headers.get("x-user-id")) ?? DEMO_USER_ID;
}
