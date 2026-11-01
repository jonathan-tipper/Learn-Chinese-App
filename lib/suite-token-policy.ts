/** Call only after the exact bearer token has passed Supabase getUser verification. */
export function acceptsVerifiedSuiteToken(token: string, userId: string, config: {
  enabled: boolean;
  clientId: string;
  supabaseUrl: string;
  allowLegacySessions: boolean;
}) {
  if (!config.enabled) return true;
  if (!config.clientId || !config.supabaseUrl || token.length > 32_768) return false;
  try {
    const segments = token.split(".");
    if (segments.length !== 3) return false;
    const claims: Record<string, unknown> = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    const issuer = `${new URL(config.supabaseUrl).origin}/auth/v1`;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.sub !== userId || claims.iss !== issuer || !audience.includes("authenticated") || claims.role !== "authenticated") return false;
    if (claims.client_id === undefined || claims.client_id === null) return config.allowLegacySessions;
    return claims.client_id === config.clientId;
  } catch { return false; }
}
