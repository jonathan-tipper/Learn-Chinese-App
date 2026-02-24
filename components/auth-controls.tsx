"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogIn, LogOut, UserCircle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AuthControls({ compact = false }: { compact?: boolean }) {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  async function onSignOut() {
    const error = await signOut();
    if (error) return;
    router.push("/login");
  }

  if (loading) {
    return (
      <div className={cn(
        "flex items-center gap-2 text-xs text-sidebar-foreground/50",
        compact && "px-3 py-2"
      )}>
        <div className="h-2 w-2 rounded-full bg-sidebar-foreground/20 animate-pulse" />
        <span>Checking…</span>
      </div>
    );
  }

  if (!user) {
    const next = pathname && pathname !== "/login" ? `?next=${encodeURIComponent(pathname)}` : "";
    if (compact) {
      return (
        <Link
          href={`/login${next}`}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
        >
          <LogIn className="h-4 w-4 shrink-0" />
          <span>Sign in</span>
        </Link>
      );
    }
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href={`/login${next}`}>
          <LogIn className="h-4 w-4" />
          Sign in
        </Link>
      </Button>
    );
  }

  if (compact) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
          <UserCircle className="h-4 w-4 shrink-0 text-sidebar-foreground/50" />
          <span className="text-xs text-sidebar-foreground/70 truncate flex-1">
            {user.email ?? "Signed in"}
          </span>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground truncate max-w-[200px]">
        {user.email ?? "Signed in"}
      </span>
      <Button variant="ghost" size="sm" onClick={onSignOut}>
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </div>
  );
}
