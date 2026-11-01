"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { completeSuiteSignIn, suiteAccountLink } from "@/lib/suite-auth";

export default function SuiteCallbackPage() {
  const router = useRouter();
  const completion = useRef<ReturnType<typeof completeSuiteSignIn> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!completion.current) {
      const callbackUrl = window.location.href;
      // Keep transient credentials out of later history/referrers. The adapter
      // receives the original exact callback URL for its state/code checks.
      window.history.replaceState(window.history.state, "", window.location.pathname);
      completion.current = completeSuiteSignIn(callbackUrl);
    }
    void completion.current.then((result) => {
      if (active) router.replace(result.next);
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : "Sign-in could not finish. Start again in this browser.");
    });
    return () => { active = false; };
  }, [router]);

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-5">
      <p className="text-sm font-semibold text-jade">jonathantipper.com</p>
      <h1 className="text-3xl font-bold">Returning to Learn Chinese.</h1>
      {error ? <><p role="alert" className="text-sm text-muted-foreground">{error}</p><a className="underline" href="/login">Start sign-in again</a><a className="underline" href={suiteAccountLink("/launchpad")}>Back to Launchpad</a></> : <p role="status" className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Finishing your sign-in…</p>}
    </section>
  );
}
