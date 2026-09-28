import type { Exercise, PlannedExercise } from "./types";

export type LoggedSet = { reps: number; rir: number };
export type LoggedSession = { loadKg: number; sets: LoggedSet[] };

export type ProgressionResult = {
  loadKg: number;
  targetReps: number;
  change: "increase" | "hold" | "decrease" | "more_reps";
  reason: string;
};

export type ProgressionOptions = {
  /** False on yellow/red days and deload weeks. */
  allowIncrease: boolean;
  /** Heaviest load available, e.g. 20 kg dumbbells in the unit gym. */
  maxLoadKg?: number;
};

export const LOAD_CUT = 0.1;

type Target = Pick<PlannedExercise, "repMin" | "repMax" | "rirMin">;

/** A session is "bad" when the first working set is below the bottom of the rep range. */
const isBad = (session: LoggedSession, target: Target) => session.sets[0].reps < target.repMin;

/**
 * Double progression. `history` is this exercise's past sessions, oldest first, newest last.
 */
export function nextProgression(
  exercise: Exercise,
  target: Target,
  history: LoggedSession[],
  options: ProgressionOptions,
): ProgressionResult {
  const last = history.at(-1);
  if (!last) throw new Error("Progression needs at least one logged session");
  const previous = history.at(-2);
  const lowest = Math.min(...last.sets.map((s) => s.reps));
  const hitTop = last.sets.every((s) => s.reps >= target.repMax && s.rir >= target.rirMin);
  const aimOneMore = Math.min(target.repMax, Math.max(target.repMin, lowest + 1));

  if (exercise.loadIncrementKg === 0) {
    if (hitTop && options.allowIncrease) {
      return { loadKg: last.loadKg, targetReps: lowest + 1, change: "more_reps", reason: "Bodyweight: all sets at the top of the range, aim for one more rep" };
    }
    return { loadKg: last.loadKg, targetReps: aimOneMore, change: "hold", reason: "Bodyweight: aim for one more rep" };
  }

  if (previous && isBad(last, target) && isBad(previous, target)) {
    const cut = last.loadKg * (1 - LOAD_CUT);
    const loadKg = Math.floor(cut / exercise.loadIncrementKg) * exercise.loadIncrementKg;
    return { loadKg, targetReps: target.repMin, change: "decrease", reason: "First set below the rep range two sessions in a row, so the weight drops 10%" };
  }

  if (hitTop) {
    const increased = last.loadKg + exercise.loadIncrementKg;
    if (!options.allowIncrease) {
      return { loadKg: last.loadKg, targetReps: target.repMax, change: "hold", reason: "Ready for more weight, but today isn't the day to add it" };
    }
    if (options.maxLoadKg !== undefined && increased > options.maxLoadKg) {
      return { loadKg: last.loadKg, targetReps: target.repMax, change: "hold", reason: "Already at the heaviest weight available" };
    }
    return { loadKg: increased, targetReps: target.repMin, change: "increase", reason: `All sets at the top of the range, so add ${exercise.loadIncrementKg} kg` };
  }

  return { loadKg: last.loadKg, targetReps: aimOneMore, change: "hold", reason: "Same weight, aim for one more rep" };
}
