import type { SrsGrade } from "@/lib/types";

export function computeScheduling(currentInterval: number, currentEase: number, grade: SrsGrade) {
  const easeDelta: Record<SrsGrade, number> = {
    again: -0.2,
    hard: -0.05,
    good: 0.05,
    easy: 0.15
  };

  const nextEase = Math.max(1.3, Number((currentEase + easeDelta[grade]).toFixed(2)));

  let nextInterval = 1;
  if (grade === "again") {
    nextInterval = 1;
  } else if (grade === "hard") {
    nextInterval = Math.max(1, Math.round(currentInterval * 1.2));
  } else if (grade === "good") {
    nextInterval = Math.max(2, Math.round(currentInterval * nextEase));
  } else {
    nextInterval = Math.max(3, Math.round(currentInterval * nextEase * 1.3));
  }

  const nextDueAt = new Date(Date.now() + nextInterval * 24 * 60 * 60 * 1000).toISOString();

  return {
    interval: nextInterval,
    ease: nextEase,
    nextDueAt
  };
}
