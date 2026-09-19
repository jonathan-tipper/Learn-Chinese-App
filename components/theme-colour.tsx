"use client";

import { useSyncExternalStore } from "react";
import { getServerTheme, getTheme, subscribeToTheme, THEME_COLOURS } from "@/lib/theme";

export function ThemeColour() {
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, getServerTheme);

  // React owns this tag so hydration cannot duplicate it after a DOM mutation.
  // Keep it outside Next's viewport metadata, which is replaced on navigation.
  return <meta name="theme-color" content={THEME_COLOURS[theme]} />;
}
