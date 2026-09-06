"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

const PUBLIC_PATHS = new Set(["/login", "/offline"]);

/**
 * Local development only: render the app without a Supabase session so the UI can be
 * exercised against the API's dev auth fallback (x-user-id / demo user). Never active in
 * production builds.
 */
const DEV_AUTH_BYPASS = process.env.NODE_ENV !== "production"
  && ["1", "true", "yes", "on"].includes((process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS ?? "").toLowerCase());

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_PATHS.has(pathname) || DEV_AUTH_BYPASS;

  useEffect(() => {
    if (loading || user || isPublic) return;
    const next = encodeURIComponent(pathname || "/");
    router.replace(`/login?next=${next}`);
  }, [isPublic, loading, pathname, router, user]);

  if (isPublic) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Checking sign-in status…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Redirecting to login…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
