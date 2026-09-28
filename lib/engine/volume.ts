import { getExercise } from "@/lib/exercises/library";
import { MUSCLES, type Experience, type Muscle, type PlannedExercise } from "./types";

export const WEEKLY_SET_BANDS: Record<Experience, { min: number; max: number }> = {
  beginner: { min: 10, max: 12 },
  intermediate: { min: 12, max: 16 },
  advanced: { min: 14, max: 20 },
};

export const MAX_SETS_PER_MUSCLE_PER_SESSION = 10;

/** Hard sets per muscle: 1 per set for the main muscle, 0.5 for each secondary muscle. */
export function sessionVolume(exercises: PlannedExercise[]): Record<Muscle, number> {
  const volume = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const planned of exercises) {
    const exercise = getExercise(planned.exerciseId);
    volume[exercise.primaryMuscle] += planned.sets;
    for (const m of exercise.secondaryMuscles) volume[m] += planned.sets * 0.5;
  }
  return volume;
}

export function weeklyVolume(sessions: PlannedExercise[][]): Record<Muscle, number> {
  return sessionVolume(sessions.flat());
}
