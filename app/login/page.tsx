"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading, user, signInWithOAuth, signInWithPassword, signUpWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [status, setStatus] = useState("Sign in with Google, GitHub, or email/password.");

  const nextPath = useMemo(() => {
    const next = searchParams.get("next");
    if (!next || !next.startsWith("/")) return "/";
    return next;
  }, [searchParams]);

  useEffect(() => {
    if (!loading && user) {
      router.replace(nextPath);
    }
  }, [loading, nextPath, router, user]);

  async function onPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Working...");

    const action = mode === "signin" ? signInWithPassword : signUpWithPassword;
    const error = await action(email.trim(), password);

    if (error) {
      setStatus(`Error: ${error}`);
      return;
    }

    if (mode === "signup") {
      setStatus("Account created. If email confirmation is enabled, check your inbox before signing in.");
      return;
    }

    setStatus("Signed in. Redirecting...");
  }

  async function onOAuthSignIn(provider: "google" | "github") {
    setStatus(`Redirecting to ${provider}...`);
    const error = await signInWithOAuth(provider, nextPath);
    if (error) {
      setStatus(`Error: ${error}`);
    }
  }

  return (
    <section>
      <h2>Login</h2>
      <div className="card">
        <p>{status}</p>
        <div className="row">
          <button type="button" onClick={() => onOAuthSignIn("google")}>Continue with Google</button>
          <button type="button" onClick={() => onOAuthSignIn("github")}>Continue with GitHub</button>
        </div>
      </div>

      <form className="card" onSubmit={onPasswordSubmit}>
        <h3>Email and Password</h3>
        <div className="row">
          <button type="button" onClick={() => setMode("signin")} disabled={mode === "signin"}>Sign in</button>
          <button type="button" onClick={() => setMode("signup")} disabled={mode === "signup"}>Create account</button>
        </div>
        <div className="row">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="row">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </div>
        <button type="submit">{mode === "signin" ? "Sign in" : "Create account"}</button>
      </form>
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<section className="card">Loading login...</section>}>
      <LoginPageContent />
    </Suspense>
  );
}
