import { describe, expect, it } from "vitest";
import { acceptsVerifiedSuiteToken } from "@/lib/suite-token-policy";

const userId = "11111111-1111-4111-8111-111111111111";
const config = { enabled: true, clientId: "learn-chinese-client", supabaseUrl: "https://project.supabase.co", allowLegacySessions: false };
const token = (overrides: Record<string, unknown> = {}) => [
  Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: userId, iss: "https://project.supabase.co/auth/v1", aud: "authenticated", role: "authenticated", client_id: config.clientId, ...overrides })).toString("base64url"),
  "signature-already-verified-by-getUser"
].join(".");

describe("app binding after Supabase identity verification", () => {
  it("accepts this app's client and rejects another client's otherwise valid user", () => {
    expect(acceptsVerifiedSuiteToken(token(), userId, config)).toBe(true);
    expect(acceptsVerifiedSuiteToken(token({ client_id: "another-app" }), userId, config)).toBe(false);
  });

  it("makes legacy direct-session acceptance an explicit migration switch", () => {
    expect(acceptsVerifiedSuiteToken(token({ client_id: null }), userId, config)).toBe(false);
    expect(acceptsVerifiedSuiteToken(token({ client_id: null }), userId, { ...config, allowLegacySessions: true })).toBe(true);
    expect(acceptsVerifiedSuiteToken(token({ client_id: "another-app" }), userId, { ...config, allowLegacySessions: true })).toBe(false);
  });

  it("rejects a different user, issuer, role and ID-token audience", () => {
    for (const claims of [{ sub: "22222222-2222-4222-8222-222222222222" }, { iss: "https://other.supabase.co/auth/v1" }, { role: "service_role" }, { aud: config.clientId }]) {
      expect(acceptsVerifiedSuiteToken(token(claims), userId, config)).toBe(false);
    }
    expect(acceptsVerifiedSuiteToken("malformed", userId, config)).toBe(false);
    expect(acceptsVerifiedSuiteToken(token(), userId, { ...config, clientId: "" })).toBe(false);
  });

  it("leaves the legacy-only rollout unchanged when the suite feature is disabled", () => {
    expect(acceptsVerifiedSuiteToken("verified-legacy-token", userId, { ...config, enabled: false })).toBe(true);
  });
});
