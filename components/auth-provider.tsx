"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Provider, Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  SUITE_AUTH_EVENT,
  getBrowserSession,
  isSuiteAuthEnabled,
  signOutBrowserSession,
  startSuiteSignIn
} from "@/lib/suite-auth";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  suiteEnabled: boolean;
  startSuiteSignIn: (nextPath?: string) => Promise<string | null>;
  signInWithPassword: (email: string, password: string) => Promise<string | null>;
  signUpWithPassword: (email: string, password: string) => Promise<string | null>;
  signInWithOAuth: (provider: Provider, nextPath: string) => Promise<string | null>;
  signOut: (scope?: "local" | "global") => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let generation = 0;
    async function load() {
      const currentGeneration = ++generation;
      try {
        const nextSession = await getBrowserSession();
        if (mounted && generation === currentGeneration) { setSession(nextSession); setAuthError(null); }
      } catch (error) {
        if (mounted && generation === currentGeneration) {
          setSession(null);
          setAuthError(error instanceof Error ? error.message : "Sign-in is temporarily unavailable.");
        }
      } finally { if (mounted && generation === currentGeneration) setLoading(false); }
    }
    void load();
    // The suite callback owns its code/verifier. The legacy SDK must not inspect it.
    let unsubscribeLegacy = () => {};
    if (window.location.pathname !== "/auth/suite/callback") {
      try {
        const legacy = getSupabaseBrowserClient().auth.onAuthStateChange(() => { void load(); });
        unsubscribeLegacy = () => legacy.data.subscription.unsubscribe();
      } catch {
        // load() presents a useful configuration state instead of crashing the shell.
      }
    }
    const onChange = () => { void load(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key?.startsWith("learn-chinese-suite:")) void load();
    };
    window.addEventListener(SUITE_AUTH_EVENT, onChange);
    window.addEventListener("focus", onChange);
    window.addEventListener("storage", onStorage);

    return () => {
      mounted = false;
      unsubscribeLegacy();
      window.removeEventListener(SUITE_AUTH_EVENT, onChange);
      window.removeEventListener("focus", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    session,
    loading,
    authError,
    suiteEnabled: isSuiteAuthEnabled(),
    async startSuiteSignIn(nextPath = "/") {
      try { await startSuiteSignIn(nextPath); return null; }
      catch (error) { return error instanceof Error ? error.message : "Shared sign-in could not start. Try again."; }
    },
    async signInWithPassword(email: string, password: string) {
      if (isSuiteAuthEnabled()) {
        try { await startSuiteSignIn(); return null; }
        catch (error) { return error instanceof Error ? error.message : "Shared sign-in could not start."; }
      }
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error?.message ?? null;
    },
    async signUpWithPassword(email: string, password: string) {
      if (isSuiteAuthEnabled()) {
        try { await startSuiteSignIn(); return null; }
        catch (error) { return error instanceof Error ? error.message : "Shared sign-in could not start."; }
      }
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: new URL("/login", window.location.origin).toString()
        }
      });
      return error?.message ?? null;
    },
    async signInWithOAuth(provider: Provider, nextPath: string) {
      if (isSuiteAuthEnabled()) {
        try { await startSuiteSignIn(nextPath); return null; }
        catch (error) { return error instanceof Error ? error.message : "Shared sign-in could not start."; }
      }
      const supabase = getSupabaseBrowserClient();
      const callback = new URL("/login", window.location.origin);
      if (nextPath) {
        callback.searchParams.set("next", nextPath);
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: callback.toString() }
      });
      return error?.message ?? null;
    },
    async signOut(scope = "local") {
      try { await signOutBrowserSession(scope); setSession(null); return null; }
      catch (error) { setSession(null); return error instanceof Error ? error.message : "This app has signed out. Revocation could not be confirmed."; }
    }
  }), [authError, loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
