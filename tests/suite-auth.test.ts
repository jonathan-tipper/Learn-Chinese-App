import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { legacySession, legacySignOut, getUser } = vi.hoisted(() => ({
  legacySession: vi.fn(),
  legacySignOut: vi.fn(),
  getUser: vi.fn()
}));
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: legacySession, signOut: legacySignOut } })
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser } }) }));

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  };
}

describe("Learn Chinese shared-account integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUITE_AUTH_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SUITE_AUTH_CLIENT_ID", "learn-chinese-client");
    vi.stubEnv("NEXT_PUBLIC_SUITE_AUTH_REDIRECT_URI", "http://localhost:4301/auth/suite/callback");
    vi.stubEnv("NEXT_PUBLIC_SUITE_ACCOUNT_ORIGIN", "http://localhost:4300");
    vi.stubEnv("NEXT_PUBLIC_SUITE_AUTH_ALLOW_LEGACY_SESSIONS", "false");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:60321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "local-public-key");
    const local = memoryStorage();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", memoryStorage());
    vi.stubGlobal("window", { location: { origin: "http://localhost:4301", pathname: "/login", assign: vi.fn() }, localStorage: local, dispatchEvent: vi.fn() });
    legacySession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    legacySignOut.mockReset().mockResolvedValue({ error: null });
    getUser.mockReset().mockResolvedValue({ data: { user: { id: "11111111-1111-4111-8111-111111111111", email: "synthetic@example.test" } }, error: null });
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  async function signedIn() {
    let issued = 0;
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      if (String(_input).includes("/logout") && init?.method === "POST") return new Response(null, { status: 204 });
      issued += 1;
      return new Response(JSON.stringify({ access_token: `app-token-${issued}`, refresh_token: `app-refresh-${issued}`, expires_in: 3600, token_type: "bearer" }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetcher);
    const integration = await import("@/lib/suite-auth");
    const suite = integration.getSuiteClient();
    if (!suite) throw new Error("Expected suite client");
    const url = new URL(await suite.authorisationUrl("/review?mode=tones#queue"));
    const callback = `http://localhost:4301/auth/suite/callback?state=${url.searchParams.get("state")}&code=one-use-code`;
    const result = await integration.completeSuiteSignIn(callback);
    return { integration, result, fetcher };
  }

  it("completes an app-owned transaction and verifies the returned user without SDK session injection", async () => {
    const { integration, result } = await signedIn();
    expect(result.next).toBe("/review?mode=tones#queue");
    expect(result.session.user.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(await integration.getBrowserAccessToken()).toBe("app-token-1");
    expect(getUser).toHaveBeenCalledWith("app-token-1");
    expect(legacySession).not.toHaveBeenCalled();
  });

  it("renews through the OAuth endpoint and persists rotated credentials", async () => {
    vi.useFakeTimers();
    const { integration, fetcher } = await signedIn();
    vi.setSystemTime(Date.now() + 3_590_000);
    expect(await integration.getBrowserAccessToken()).toBe("app-token-2");
    const [url, request] = fetcher.mock.calls.at(-1)!;
    expect(String(url)).toBe("http://127.0.0.1:60321/auth/v1/oauth/token");
    expect(new URLSearchParams(String(request?.body)).get("grant_type")).toBe("refresh_token");
    expect(new URLSearchParams(String(request?.body)).get("client_id")).toBe("learn-chinese-client");
    expect(legacySession).not.toHaveBeenCalled();
  });

  it("clears suite and legacy local sessions without revoking other apps by default", async () => {
    const { integration, fetcher } = await signedIn();
    await integration.signOutBrowserSession();
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/logout?scope=local"))).toBe(true);
    expect(legacySignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(await integration.getBrowserAccessToken()).toBeNull();
    expect(legacySession).not.toHaveBeenCalled();
  });

  it("does not combine an old verified user with a newly switched account token", async () => {
    const { integration } = await signedIn();
    getUser.mockImplementationOnce(async () => {
      const suite = integration.getSuiteClient();
      if (!suite) throw new Error("Expected suite client");
      const request = new URL(await suite.authorisationUrl("/"));
      await suite.complete(`http://localhost:4301/auth/suite/callback?state=${request.searchParams.get("state")}&code=new-account-code`);
      return { data: { user: { id: "11111111-1111-4111-8111-111111111111", email: "old@example.test" } }, error: null };
    }).mockResolvedValue({ data: { user: { id: "22222222-2222-4222-8222-222222222222", email: "new@example.test" } }, error: null });
    const active = await integration.getBrowserSession();
    expect(active?.access_token).toBe("app-token-2");
    expect(active?.user.id).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("accepts previous direct sessions only during the explicit compatibility window", async () => {
    legacySession.mockResolvedValue({ data: { session: { access_token: "old-direct-token", user: { id: "old" } } }, error: null });
    const integration = await import("@/lib/suite-auth");
    expect(await integration.getBrowserAccessToken()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUITE_AUTH_ALLOW_LEGACY_SESSIONS", "true");
    expect(await integration.getBrowserAccessToken()).toBe("old-direct-token");
  });

  it("does not let the legacy SDK consume the dedicated suite callback", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUITE_AUTH_ALLOW_LEGACY_SESSIONS", "true");
    window.location.pathname = "/auth/suite/callback";
    const integration = await import("@/lib/suite-auth");
    expect(await integration.getBrowserSession()).toBeNull();
    expect(legacySession).not.toHaveBeenCalled();
  });

  it("rejects unsafe returns and refuses to start from a different app origin", async () => {
    const integration = await import("@/lib/suite-auth");
    expect(integration.safeAppReturnPath("//example.org")).toBe("/");
    expect(integration.safeAppReturnPath("/%2f%2fexample.org")).toBe("/");
    expect(integration.safeAppReturnPath("/auth/suite/callback?code=old")).toBe("/");
    vi.stubGlobal("window", { ...window, location: { ...window.location, origin: "https://old-preview.vercel.app" } });
    await expect(integration.startSuiteSignIn("/review")).rejects.toThrow("main app address");
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it("leaves old direct-session loading available when shared sign-in is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUITE_AUTH_ENABLED", "false");
    legacySession.mockResolvedValue({ data: { session: { access_token: "direct", user: { id: "old" } } }, error: null });
    const integration = await import("@/lib/suite-auth");
    expect(await integration.getBrowserAccessToken()).toBe("direct");
  });

  it("does not forward app credentials to a different origin", async () => {
    const { fetcher } = await signedIn();
    const { authedFetch } = await import("@/lib/authed-fetch");
    const before = fetcher.mock.calls.length;
    await expect(authedFetch("https://another-app.example/api/profile")).rejects.toThrow("stay on this app");
    expect(fetcher.mock.calls).toHaveLength(before);
  });
});
