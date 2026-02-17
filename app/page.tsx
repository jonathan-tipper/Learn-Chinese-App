"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function HomePage() {
  const [showNudge, setShowNudge] = useState(false);

  useEffect(() => {
    const hour = new Date().getHours();
    const today = new Date().toISOString().slice(0, 10);
    const lastSessionDate = localStorage.getItem("lastSessionDate");
    setShowNudge(hour >= 18 && lastSessionDate !== today);
  }, []);

  return (
    <section>
      <h2>Today&apos;s Session</h2>
      <p>Resume your Mandarin coach flow: warm-up, guided conversation, and review generation.</p>
      <div className="row">
        <Link href="/chat">Start Daily Session</Link>
        <Link href="/review">Quick Practice (2 min)</Link>
      </div>

      {showNudge ? (
        <div className="card">
          <h3>Gentle nudge</h3>
          <p>You can still protect your streak with a quick 2-minute practice.</p>
          <Link href="/review">Do quick practice now</Link>
        </div>
      ) : null}

      <div className="card">
        <h3>Continuity Preview</h3>
        <p>Yesterday you practiced ordering coffee. Today we&apos;ll add polite follow-up questions.</p>
      </div>
    </section>
  );
}
