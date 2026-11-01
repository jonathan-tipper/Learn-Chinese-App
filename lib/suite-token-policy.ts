/** Call only after the exact bearer token has passed Supabase getUser verification. */
export function acceptsVerifiedSuiteToken(token: string, userId: string, config: {
  enabled: boolean;
  clientId: string;
  supabaseUrl: string;
  allowLegacySessions: boolean;
}) {
  if (!config.supabaseUrl || token.length > 32_768 || (config.enabled && !config.clientId)) return false;
  try {
    const segments = token.split(".");
    if (segments.length !== 3 || segments.some((segment) => !segment) || !/^[A-Za-z0-9_-]+$/.test(segments[1])) return false;
    const decoded: unknown = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return false;
    const claims = decoded as Record<string, unknown>;
    const issuer = `${new URL(config.supabaseUrl).origin}/auth/v1`;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.sub !== userId || claims.iss !== issuer || !audience.every((entry) => typeof entry === "string") || !audience.includes("authenticated") || claims.role !== "authenticated") return false;
    if (claims.client_id === undefined || claims.client_id === null) {
      return !config.enabled || config.allowLegacySessions;
    }
    // Disabling or rolling back suite sign-in must revoke API admission for
    // already-issued OAuth tokens, including this app's former client.
    return config.enabled && claims.client_id === config.clientId;
  } catch { return false; }
}
