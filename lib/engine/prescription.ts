import type { Exercise, ExerciseType, Goal, PlannedExercise } from "./types";

export const REST_LIMITS: Record<ExerciseType, { min: number; max: number }> = {
  compound: { min: 120, max: 180 },
  isolation: { min: 60, max: 120 },
};

export function prescribe(exercise: Exercise, goal: Goal, sets: number): PlannedExercise {
  const rest = REST_LIMITS[exercise.type];
  const base = { exerciseId: exercise.id, sets, adjustments: [] };

  if (exercise.type === "isolation") {
    return { ...base, repMin: 10, repMax: 20, rirMin: 1, rirMax: 2, restSeconds: (rest.min + rest.max) / 2 };
  }
  const [repMin, repMax] = goal === "strength" ? [3, 6] : [5, 10];
  return { ...base, repMin, repMax, rirMin: 2, rirMax: 3, restSeconds: (rest.min + rest.max) / 2 };
}
