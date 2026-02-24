"use client";

import { useEffect } from "react";
import Link from "next/link";
import { WifiOff, BookOpen, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  // Reload automatically when the connection is restored
  useEffect(() => {
    function handleOnline() {
      window.location.reload();
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        {/* Chinese offline label */}
        <div className="text-center space-y-1">
          <p className="text-5xl hanzi text-muted-foreground/40 select-none">离线</p>
          <p className="text-xs text-muted-foreground tracking-widest uppercase">Lí xiàn</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <WifiOff className="h-4 w-4 text-muted-foreground" />
              You&apos;re offline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              AI conversation requires an internet connection. But you can still
              practise vocabulary with your cached flashcards.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button asChild className="flex-1">
                <Link href="/review">
                  <BookOpen className="h-4 w-4" />
                  Quick practice
                </Link>
              </Button>

              <Button
                variant="outline"
                className="flex-1"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              This page will reload automatically when you&apos;re back online.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
