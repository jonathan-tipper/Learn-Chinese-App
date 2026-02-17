"use client";

import { useEffect, useState } from "react";

type Summary = {
  totalSessions: number;
  totalMinutes: number;
  streakDays: number;
  vocabLearning: number;
  dueCards: number;
  weakAreas: string[];
};

export default function ProgressPage() {
  const [summary, setSummary] = useState<Summary | null>(null);

  async function refresh() {
    const response = await fetch("/api/progress/summary");
    const data = await response.json();
    setSummary(data.summary ?? null);
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <section>
      <h2>Progress & Insights</h2>
      <button type="button" onClick={refresh}>Refresh</button>
      <div className="card">
        <h3>Your week in Mandarin</h3>
        <ul>
          <li>Total sessions: {summary?.totalSessions ?? 0}</li>
          <li>Total minutes: {summary?.totalMinutes ?? 0}</li>
          <li>Streak days: {summary?.streakDays ?? 0}</li>
          <li>Vocabulary in learning: {summary?.vocabLearning ?? 0}</li>
          <li>Due review cards: {summary?.dueCards ?? 0}</li>
          <li>Weak areas: {(summary?.weakAreas ?? []).join(", ") || "n/a"}</li>
        </ul>
      </div>
      <div className="card">
        <h3>Next-week focus</h3>
        <p>Short workplace dialogues + polite requests + review of yesterday’s weak cards.</p>
      </div>
    </section>
  );
}
