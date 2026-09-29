import type { Exercise, Goal } from "./types";
import { prescribe } from "./prescription";

export const CALIBRATION_INSTRUCTION = "Pick a weight you could lift for about 10 reps with 2 left in reserve.";

/** A recent "last solid set" the user told us about. */
export type RecentSet = { weightKg: number; reps: number };

export type StartingLoad =
  | { kind: "weight"; kg: number }
  | { kind: "calibration"; instruction: string };

/** Epley: weight × (1 + reps/30). One rep is the weight itself. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/**
 * Weight for a set of `targetReps` that leaves `targetRIR` in reserve:
 * Epley reversed with (targetReps + targetRIR), rounded DOWN to the
 * exercise's increment, and never below one increment.
 */
export function startingLoad(e1rm: number, targetReps: number, targetRIR: number, increment: number): number {
  const raw = e1rm / (1 + (targetReps + targetRIR) / 30);
  // The small epsilon stops float error (e.g. 59.999999) from rounding a whole step down.
  const steps = Math.floor(raw / increment + 1e-9);
  return Math.max(steps, 1) * increment;
}

/**
 * Starting load for an exercise on the first session.
 * Uses the TOP of the rep range with the target RIR (Decision 15), so we
 * start slightly light and double progression corrects it. With no recent
 * set (or a bodyweight exercise) the answer is a calibration marker.
 */
export function startingLoadFor(exercise: Exercise, goal: Goal, recent: RecentSet | undefined): StartingLoad {
  if (!recent || exercise.loadIncrementKg <= 0) {
    return { kind: "calibration", instruction: CALIBRATION_INSTRUCTION };
  }
  const { repMax, rirMin } = prescribe(exercise, goal, 1);
  const e1rm = estimateOneRepMax(recent.weightKg, recent.reps);
  return { kind: "weight", kg: startingLoad(e1rm, repMax, rirMin, exercise.loadIncrementKg) };
}
