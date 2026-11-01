import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getUserIdFromRequest } from "@/lib/auth";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/env", () => ({ isSupabaseAuthEnabled: () => true, isDevAuthFallbackEnabled: () => true }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAuthClient: () => ({ auth: { getUser } }) }));

const userId = "11111111-1111-4111-8111-111111111111";
const token = (clientId: string | null) => `${Buffer.from('{"alg":"ES256"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, iss: "https://project.supabase.co/auth/v1", aud: "authenticated", role: "authenticated", client_id: clientId })).toString("base64url")}.provider-verified-signature`;
const request = (value: string) => new Request("https://learn-chinese.jonathantipper.com/api/profile", { headers: { Authorization: `Bearer ${value}` } });

describe("API identity and OAuth client binding", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUITE_AUTH_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SUITE_AUTH_CLIENT_ID", "learn-chinese-client");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUITE_AUTH_ALLOW_LEGACY_SESSIONS", "false");
    getUser.mockReset().mockResolvedValue({ data: { user: { id: userId } }, error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("preserves the verified user UUID for the registered Learn Chinese client", async () => {
    const value = token("learn-chinese-client");
    await expect(getUserIdFromRequest(request(value))).resolves.toBe(userId);
    expect(getUser).toHaveBeenCalledWith(value);
  });

  it("rejects another app's token even if Supabase returns the same verified user", async () => {
    await expect(getUserIdFromRequest(request(token("another-app")))).rejects.toThrow("Invalid bearer token");
    expect(getUser).toHaveBeenCalledOnce();
  });

  it("rejects signature/provider verification failure before trusting claims", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("Signature invalid") });
    await expect(getUserIdFromRequest(request(token("learn-chinese-client")))).rejects.toThrow("Invalid bearer token");
  });

  it("allows a previous direct session only under explicit compatibility configuration", async () => {
    await expect(getUserIdFromRequest(request(token(null)))).rejects.toThrow("Invalid bearer token");
    vi.stubEnv("NEXT_PUBLIC_SUITE_AUTH_ALLOW_LEGACY_SESSIONS", "true");
    await expect(getUserIdFromRequest(request(token(null)))).resolves.toBe(userId);
  });

  it("does not use development identity fallback while shared sign-in is enabled", async () => {
    const missing = new Request("https://learn-chinese.jonathantipper.com/api/profile", { headers: { "x-user-id": userId } });
    await expect(getUserIdFromRequest(missing)).rejects.toThrow("Missing bearer token");
    expect(getUser).not.toHaveBeenCalled();
  });
});
