"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Github, Loader2, Mail, LogIn } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading, user, signInWithOAuth, signInWithPassword, signUpWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [status, setStatus] = useState<{ type: "idle" | "loading" | "error" | "success"; message: string }>({
    type: "idle",
    message: ""
  });

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
    setStatus({ type: "loading", message: "Working…" });

    const action = mode === "signin" ? signInWithPassword : signUpWithPassword;
    const error = await action(email.trim(), password);

    if (error) {
      setStatus({ type: "error", message: error });
      return;
    }

    if (mode === "signup") {
      setStatus({ type: "success", message: "Account created! Check your inbox if email confirmation is enabled." });
      return;
    }

    setStatus({ type: "success", message: "Signed in. Redirecting…" });
  }

  async function onOAuthSignIn(provider: "google" | "github") {
    setStatus({ type: "loading", message: `Redirecting to ${provider}…` });
    const error = await signInWithOAuth(provider, nextPath);
    if (error) {
      setStatus({ type: "error", message: error });
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center animate-fade-in">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand header */}
        <div className="flex flex-col items-center space-y-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background font-bold text-2xl shadow-md">
            汉
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Learn Chinese</h1>
            <p className="text-sm text-muted-foreground mt-1">Your personal Mandarin coach</p>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg">
              {mode === "signin" ? "Welcome back" : "Create an account"}
            </CardTitle>
            <CardDescription>
              {mode === "signin"
                ? "Sign in to continue your Mandarin journey"
                : "Start your Mandarin learning journey today"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* OAuth buttons */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => onOAuthSignIn("google")}
                disabled={status.type === "loading"}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => onOAuthSignIn("github")}
                disabled={status.type === "loading"}
              >
                <Github className="h-4 w-4" />
                Continue with GitHub
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            {/* Mode toggle */}
            <div className="flex rounded-lg border p-1 gap-1">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "signin"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === "signup"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Create account
              </button>
            </div>

            {/* Email/password form */}
            <form onSubmit={onPasswordSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </div>

              {status.message && (
                <p className={`text-xs rounded-md px-3 py-2 ${
                  status.type === "error"
                    ? "bg-destructive/10 text-destructive"
                    : status.type === "success"
                    ? "bg-jade/10 text-jade"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {status.message}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={status.type === "loading"}>
                {status.type === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mode === "signin" ? (
                  <>
                    <LogIn className="h-4 w-4" />
                    Sign in
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Create account
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          By continuing, you agree to our terms of service and privacy policy.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
