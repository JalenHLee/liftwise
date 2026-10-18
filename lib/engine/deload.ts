import { getExercise } from "@/lib/exercises/library";
import { halve } from "./readiness";
import type { PlannedExercise, Readiness } from "./types";

export const DELOAD_EVERY_WEEKS = 6;

export type WeeklyBest = { loadKg: number; reps: number };

export type DeloadInput = {
  /** Week number counted from the last deload (or program start); the first week is 1. */
  weekSinceLastDeload: number;
  /** Best set per week for each lift, oldest week first. Non-key lifts are ignored. */
  weeklyBests: Record<string, WeeklyBest[]>;
  /** Check-in results with ISO dates (YYYY-MM-DD). */
  checkIns: { date: string; level: Readiness }[];
  today: string;
};

/** Heavier wins; at the same weight, more reps wins. */
export const beats = (a: WeeklyBest, b: WeeklyBest) => a.loadKg > b.loadKg || (a.loadKg === b.loadKg && a.reps > b.reps);

/** Stalled = neither of the last 2 weeks beat the best from before them. */
export function isStalled(bests: WeeklyBest[]): boolean {
  if (bests.length < 3) return false;
  const before = bests.slice(0, -2);
  const best = before.reduce((a, b) => (beats(b, a) ? b : a));
  return bests.slice(-2).every((week) => !beats(week, best));
}

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

export function checkDeload(input: DeloadInput): { deload: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (input.weekSinceLastDeload >= DELOAD_EVERY_WEEKS) reasons.push("Scheduled deload every 6th week");

  const stalled = Object.entries(input.weeklyBests).filter(
    ([id, bests]) => getExercise(id).keyLift && isStalled(bests),
  );
  if (stalled.length >= 2) reasons.push("2 or more key lifts have stalled for 2 weeks");

  const today = dayNumber(input.today);
  const redDays = input.checkIns.filter(
    (c) => c.level === "red" && today - dayNumber(c.date) >= 0 && today - dayNumber(c.date) < 7,
  );
  if (redDays.length >= 3) reasons.push("3 or more red days in the last 7 days");

  return { deload: reasons.length > 0, reasons };
}

export function applyDeload(exercises: PlannedExercise[]): PlannedExercise[] {
  return exercises.map((e) => ({
    ...e,
    sets: halve(e.sets),
    rirMin: 4,
    rirMax: 4,
    adjustments: [...e.adjustments, "Deload week: half the sets, same weight, 4 reps in reserve"],
  }));
}
