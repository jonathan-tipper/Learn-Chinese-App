import { isDevAuthFallbackEnabled, isSupabaseAuthEnabled } from "@/lib/env";
import { getSupabaseAuthClient } from "@/lib/supabase";
import { acceptsVerifiedSuiteToken } from "@/lib/suite-token-policy";

const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

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
  if (token) {
    if (!isSupabaseAuthEnabled()) {
      throw new UnauthorizedError("Auth provider is not configured.");
    }

    try {
      const client = getSupabaseAuthClient();
      const { data, error } = await client.auth.getUser(token);
      if (error) {
        throw error;
      }

      const userId = normalizeUserId(data.user?.id ?? null);
      if (userId) {
        if (!acceptsVerifiedSuiteToken(token, userId, {
          enabled: process.env.NEXT_PUBLIC_SUITE_AUTH_ENABLED === "true",
          clientId: process.env.NEXT_PUBLIC_SUITE_AUTH_CLIENT_ID ?? "",
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
          allowLegacySessions: process.env.NEXT_PUBLIC_SUITE_AUTH_ALLOW_LEGACY_SESSIONS === "true"
        })) throw new UnauthorizedError("This account session is not authorised for this app.");
        return userId;
      }
    } catch {
      throw new UnauthorizedError("Invalid bearer token.");
    }

    throw new UnauthorizedError("Invalid bearer token.");
  }

  if (process.env.NEXT_PUBLIC_SUITE_AUTH_ENABLED === "true" || !isDevAuthFallbackEnabled()) {
    throw new UnauthorizedError("Missing bearer token.");
  }

  return normalizeUserId(request.headers.get("x-user-id")) ?? DEMO_USER_ID;
}
