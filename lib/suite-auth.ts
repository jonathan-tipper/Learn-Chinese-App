import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { browserSuiteStore, createSuiteClient, safeReturnPath } from "@/lib/vendor/suite-client.mjs";

export const SUITE_AUTH_EVENT = "learn-chinese:suite-auth";
const callbackPath = "/auth/suite/callback";
const suiteOwnerKey = "learn-chinese-suite:active";
let suiteClient: ReturnType<typeof createSuiteClient> | null = null;
let verificationClient: SupabaseClient | null = null;

export function isSuiteAuthEnabled() {
  return process.env.NEXT_PUBLIC_SUITE_AUTH_ENABLED === "true";
}

export function isLegacySuiteCompatibilityEnabled() {
  return process.env.NEXT_PUBLIC_SUITE_AUTH_ALLOW_LEGACY_SESSIONS === "true";
}

function hasOwnedSuiteSession() {
  return typeof window !== "undefined" && window.localStorage.getItem(suiteOwnerKey) === "true";
}

function announceSessionChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SUITE_AUTH_EVENT));
}

export function suiteAccountOrigin() {
  const configured = process.env.NEXT_PUBLIC_SUITE_ACCOUNT_ORIGIN || "https://www.jonathantipper.com";
  const url = new URL(configured);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new Error("The account address is not configured correctly.");
  }
  return url.origin;
}

export function suiteAccountLink(path: "/launchpad" | "/account" | "/privacy") {
  try { return new URL(path, suiteAccountOrigin()).href; }
  catch { return new URL(path, "https://www.jonathantipper.com").href; }
}

export function safeAppReturnPath(value: unknown) {
  const next = safeReturnPath(value);
  return next.startsWith(callbackPath) || next.startsWith("/login") ? "/" : next;
}

export function getSuiteClient() {
  if (!isSuiteAuthEnabled()) return null;
  if (suiteClient) return suiteClient;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const clientId = process.env.NEXT_PUBLIC_SUITE_AUTH_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_SUITE_AUTH_REDIRECT_URI;
  if (!supabaseUrl || !publishableKey || !clientId || !redirectUri) {
    throw new Error("Shared sign-in is not configured for this app yet. Please try again later.");
  }
  suiteAccountOrigin();
  const callback = new URL(redirectUri);
  if (callback.pathname !== callbackPath) throw new Error("The app's sign-in callback is not configured correctly.");
  suiteClient = createSuiteClient({
    supabaseUrl, publishableKey, clientId, redirectUri,
    store: browserSuiteStore("learn-chinese-suite")
  });
  return suiteClient;
}

export function suiteCanonicalAppUrl() {
  const value = process.env.NEXT_PUBLIC_SUITE_AUTH_REDIRECT_URI;
  if (!value) return null;
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.pathname !== callbackPath) return null;
    return url.origin;
  } catch { return null; }
}

function userVerificationClient() {
  if (!verificationClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Account verification is not configured.");
    verificationClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "learn-chinese-suite-identity-check" }
    });
  }
  return verificationClient;
}

/** APIs still verify the bearer token; this helper only supplies app-owned credentials. */
export async function getBrowserAccessToken(): Promise<string | null> {
  const suite = getSuiteClient();
  if (suite && await suite.getSession()) {
    try { return await suite.accessToken(); } catch (error) { announceSessionChange(); throw error; }
  }
  if (suite && (hasOwnedSuiteSession() || !isLegacySuiteCompatibilityEnabled())) return null;
  // Do not let the legacy SDK consume an OAuth-server callback as its own PKCE flow.
  if (typeof window !== "undefined" && window.location.pathname === callbackPath) return null;
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error) throw new Error("Your sign-in session could not be read. Sign in again.");
  return data.session?.access_token ?? null;
}

export async function getBrowserSession(retries = 0): Promise<Session | null> {
  const suite = getSuiteClient();
  const stored = suite ? await suite.getSession() : null;
  if (suite && stored) {
    const token = await suite.accessToken();
    if (!token) return null;
    const { data, error } = await userVerificationClient().auth.getUser(token);
    if (error || !data.user) throw new Error("Your account session could not be verified. Sign in again.");
    const current = await suite.getSession();
    if (!current) return null;
    if (current.accessToken !== token) {
      if (retries >= 1) throw new Error("Your account changed while it was being checked. Try again.");
      return getBrowserSession(retries + 1);
    }
    return {
      access_token: current.accessToken,
      refresh_token: current.refreshToken,
      expires_at: Math.floor(current.expiresAt / 1000),
      expires_in: Math.max(0, Math.floor((current.expiresAt - Date.now()) / 1000)),
      token_type: "bearer",
      user: data.user
    };
  }
  if (suite && (hasOwnedSuiteSession() || !isLegacySuiteCompatibilityEnabled())) return null;
  if (typeof window !== "undefined" && window.location.pathname === callbackPath) return null;
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error) throw new Error("Your sign-in session could not be read. Sign in again.");
  if (suite && data.session) {
    const verified = await userVerificationClient().auth.getUser(data.session.access_token);
    if (verified.error || !verified.data.user) throw new Error("Your previous account session could not be verified. Sign in again.");
    return { ...data.session, user: verified.data.user };
  }
  return data.session ?? null;
}

export async function startSuiteSignIn(nextPath = "/") {
  const suite = getSuiteClient();
  if (!suite) throw new Error("Shared sign-in is not enabled for this app.");
  if (suiteCanonicalAppUrl() !== window.location.origin) {
    throw new Error("Open Learn Chinese at its main app address before signing in. Your browser saves remain at the address where you created them.");
  }
  window.location.assign(await suite.authorisationUrl(safeAppReturnPath(nextPath)));
}

export async function completeSuiteSignIn(callbackUrl: string) {
  const suite = getSuiteClient();
  if (!suite) throw new Error("Shared sign-in is not enabled for this app.");
  const result = await suite.complete(callbackUrl);
  window.localStorage.setItem(suiteOwnerKey, "true");
  const session = await getBrowserSession();
  if (!session) throw new Error("The account session could not be verified.");
  announceSessionChange();
  return { next: safeAppReturnPath(result.next), session };
}

export async function signOutBrowserSession(scope: "local" | "global" = "local") {
  let failure: unknown;
  const suite = getSuiteClient();
  try { if (suite) await suite.signOut({ scope }); } catch (error) { failure = error; }
  // Clearing the legacy session too prevents an old account reappearing after suite sign-out.
  const { error } = await getSupabaseBrowserClient().auth.signOut({ scope });
  announceSessionChange();
  if (failure) throw failure;
  if (error) throw new Error("This app is signed out. Account-service revocation could not be confirmed.");
}
