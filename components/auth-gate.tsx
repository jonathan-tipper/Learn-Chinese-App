"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";

const PUBLIC_PATHS = new Set(["/login"]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_PATHS.has(pathname);

  useEffect(() => {
    if (loading || user || isPublic) return;
    const next = encodeURIComponent(pathname || "/");
    router.replace(`/login?next=${next}`);
  }, [isPublic, loading, pathname, router, user]);

  if (isPublic) {
    return <>{children}</>;
  }

  if (loading) {
    return <section className="card">Checking sign-in status...</section>;
  }

  if (!user) {
    return <section className="card">Redirecting to login...</section>;
  }

  return <>{children}</>;
}
