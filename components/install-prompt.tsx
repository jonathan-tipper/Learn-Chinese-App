"use client";

import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Not in the standard TypeScript lib
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISSED_KEY = "pwa-install-dismissed";

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Don't show if already installed as standalone
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    // Don't show if user previously dismissed
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !("standalone" in navigator && (navigator as { standalone?: boolean }).standalone);
    if (ios) {
      setIsIOS(true);
      setShow(true);
      return;
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") localStorage.setItem(DISMISSED_KEY, "1");
    setDeferredPrompt(null);
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 lg:bottom-6 lg:left-auto lg:right-6 lg:w-80">
      <Card className="shadow-lg border-foreground/10">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-jade/10">
              {isIOS ? (
                <Smartphone className="h-5 w-5 text-jade" />
              ) : (
                <Download className="h-5 w-5 text-jade" />
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-semibold leading-tight">Add to Home Screen</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isIOS
                  ? 'Tap the Share button then "Add to Home Screen" for offline access and streak reminders.'
                  : "Install for offline flashcards and streak reminders."}
              </p>

              {!isIOS && (
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="h-7 text-xs px-3" onClick={install}>
                    Install
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs px-3" onClick={dismiss}>
                    Not now
                  </Button>
                </div>
              )}
            </div>

            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0 -mt-0.5 -mr-1 text-muted-foreground"
              onClick={dismiss}
              aria-label="Dismiss install prompt"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
