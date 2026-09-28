import { MUSCLES, type CheckIn, type PlannedExercise, type Readiness } from "./types";

export type ReadinessResult = {
  level: Readiness;
  reasons: string[];
  /** Load increases are only allowed on green days. */
  progressionAllowed: boolean;
};

export function scoreReadiness(checkIn: CheckIn): ReadinessResult {
  const { sleepHours, energy } = checkIn;
  const soreness = MUSCLES.map((m) => checkIn.soreness[m] ?? 1);
  const verySore = soreness.filter((s) => s >= 4).length;

  const red: string[] = [];
  if (sleepHours < 5 && energy <= 2) red.push("Under 5 hours of sleep and low energy");
  if (verySore >= 3) red.push("3 or more muscles are very sore");
  if (red.length) return { level: "red", reasons: red, progressionAllowed: false };

  const yellow: string[] = [];
  if (sleepHours < 6) yellow.push("Under 6 hours of sleep");
  if (energy <= 2) yellow.push("Low energy");
  if (soreness.some((s) => s >= 3)) yellow.push("Some muscles are sore");
  if (yellow.length) return { level: "yellow", reasons: yellow, progressionAllowed: false };

  return { level: "green", reasons: [], progressionAllowed: true };
}

export const halve = (sets: number) => Math.max(1, Math.ceil(sets / 2));

export function applyReadiness(exercises: PlannedExercise[], level: Readiness): PlannedExercise[] {
  if (level === "yellow") {
    return exercises.map((e) => {
      const rirMin = Math.max(e.rirMin, 3);
      return {
        ...e,
        sets: Math.max(1, e.sets - 1),
        rirMin,
        rirMax: Math.max(e.rirMax, rirMin),
        adjustments: [...e.adjustments, "Yellow day: one fewer set, easier effort (3+ reps in reserve), no weight increase"],
      };
    });
  }
  if (level === "red") {
    return exercises.map((e) => ({
      ...e,
      sets: halve(e.sets),
      adjustments: [...e.adjustments, "Red day: about half the sets, weight held"],
    }));
  }
  return exercises;
}
