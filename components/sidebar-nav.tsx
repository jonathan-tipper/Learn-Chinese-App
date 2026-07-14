"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageCircle,
  BookOpen,
  Languages,
  Headphones,
  BarChart2,
  Brain,
  Settings,
  LogIn
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { AuthControls } from "@/components/auth-controls";

const NAV_ITEMS: Array<{ href: string; label: string; mobileLabel?: string; icon: LucideIcon }> = [
  { href: "/", label: "Home", icon: Home },
  { href: "/chat", label: "Chat", icon: MessageCircle },
  { href: "/review", label: "Review", icon: BookOpen },
  { href: "/characters", label: "Characters", mobileLabel: "Hanzi", icon: Languages },
  { href: "/tone-practice", label: "Tones", icon: Headphones },
  { href: "/progress", label: "Progress", mobileLabel: "Stats", icon: BarChart2 },
  { href: "/memory", label: "Memory", mobileLabel: "Saved", icon: Brain }
] as const;

const CHROME_HIDDEN_PATHS = new Set(["/login", "/offline"]);

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed = false
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  collapsed?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        collapsed && "justify-center px-2"
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  if (CHROME_HIDDEN_PATHS.has(pathname)) return null;

  return (
    <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-56 bg-sidebar border-r border-sidebar-border z-30">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-crimson/90 text-crimson-foreground font-bold text-base shrink-0">
          汉
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-sidebar-foreground leading-tight">Learn Chinese</span>
          <span className="text-xs text-sidebar-foreground/50 leading-tight">Mandarin Coach</span>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={pathname === item.href}
          />
        ))}

        <div className="pt-3 border-t border-sidebar-border/60 mt-3">
          <NavLink
            href="/onboarding"
            label="Settings"
            icon={Settings}
            active={pathname === "/onboarding"}
          />
        </div>
      </nav>

      {/* User section */}
      <div className="px-3 pb-4 border-t border-sidebar-border pt-3">
        <AuthControls compact />
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  if (CHROME_HIDDEN_PATHS.has(pathname)) return null;

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-sidebar border-t border-sidebar-border safe-area-inset-bottom">
      <div className="flex items-center justify-around px-1 py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors sm:text-xs",
                active
                  ? "text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
              )}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  active && "text-crimson"
                )}
              />
              <span className="max-w-full truncate">{item.mobileLabel ?? item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function MobileHeader() {
  const { user } = useAuth();
  const pathname = usePathname();
  if (CHROME_HIDDEN_PATHS.has(pathname)) return null;

  return (
    <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-background/95 backdrop-blur border-b border-border">
      <Link href="/" className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-crimson/90 text-crimson-foreground font-bold text-sm">
          汉
        </div>
        <span className="font-semibold text-sm">Learn Chinese</span>
      </Link>
      <div className="flex items-center gap-2">
        {user ? (
          <span className="text-xs text-muted-foreground truncate max-w-[140px]">{user.email}</span>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
