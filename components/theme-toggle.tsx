"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getServerTheme, getTheme, setTheme, subscribeToTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, getServerTheme);
  const isDark = theme === "dark";
  const Icon = isDark ? Moon : Sun;

  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "icon" : "default"}
      role="switch"
      aria-label="Dark mode"
      aria-checked={isDark}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn("shrink-0", className)}
    >
      <Icon aria-hidden="true" />
      {!compact && <span>{isDark ? "Dark mode" : "Light mode"}</span>}
    </Button>
  );
}
