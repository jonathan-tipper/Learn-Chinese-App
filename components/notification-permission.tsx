"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

const DISMISSED_KEY = "push-permission-dismissed";
const VISIT_KEY     = "visit-count";

// The public VAPID key is safe to expose in the browser bundle
const PUBLIC_VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from({ length: raw.length }, (_, i) => raw.charCodeAt(i));
}

export function NotificationPermission() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!PUBLIC_VAPID_KEY) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "default") return; // already decided
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Show from the 2nd visit so it doesn't compete with the install prompt
    const visits = parseInt(localStorage.getItem(VISIT_KEY) ?? "0", 10) + 1;
    localStorage.setItem(VISIT_KEY, String(visits));
    if (visits >= 2) setShow(true);
  }, []);

  async function enable() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setShow(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
      });

      // Get the current Supabase session so we can pass the bearer token
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify(sub.toJSON()),
      });
    } catch (err) {
      console.error("[push] subscription failed", err);
    } finally {
      setShow(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  }

  if (!show) return null;

  return (
    // Sits one banner-height above the install prompt on mobile (bottom-36 vs bottom-20)
    <div className="fixed bottom-36 left-4 right-4 z-40 lg:bottom-20 lg:left-auto lg:right-6 lg:w-80">
      <Card className="shadow-lg border-foreground/10">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
              <Bell className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-semibold leading-tight">Enable streak reminders</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Get an evening nudge if you haven&apos;t practised yet.
              </p>
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="h-7 text-xs px-3" onClick={enable}>
                  Enable
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs px-3" onClick={dismiss}>
                  Not now
                </Button>
              </div>
            </div>

            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0 -mt-0.5 -mr-1 text-muted-foreground"
              onClick={dismiss}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
