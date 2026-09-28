import { getExercise } from "@/lib/exercises/library";
import { halve } from "./readiness";
import { MUSCLES, type CheckIn, type PainArea, type PlannedExercise } from "./types";

export function applySoreness(exercises: PlannedExercise[], soreness: CheckIn["soreness"]): PlannedExercise[] {
  const verySore = MUSCLES.filter((m) => (soreness[m] ?? 1) >= 4);
  return exercises.map((e) => {
    const muscle = getExercise(e.exerciseId).primaryMuscle;
    if (!verySore.includes(muscle)) return e;
    return {
      ...e,
      sets: halve(e.sets),
      adjustments: [...e.adjustments, `Your ${muscle} is very sore, so sets are halved`],
    };
  });
}

export const PAIN_MESSAGE =
  "You flagged pain, so we removed every exercise that loads that area. Please get it checked by a medic/doctor. This is not medical advice.";

export type PainResult = {
  exercises: PlannedExercise[];
  removedIds: string[];
  message: string | null;
};

export function applyPain(exercises: PlannedExercise[], painAreas: PainArea[]): PainResult {
  if (painAreas.length === 0) return { exercises, removedIds: [], message: null };
  const hurts = (e: PlannedExercise) => getExercise(e.exerciseId).loadsAreas.some((a) => painAreas.includes(a));
  return {
    exercises: exercises.filter((e) => !hurts(e)),
    removedIds: exercises.filter(hurts).map((e) => e.exerciseId),
    message: PAIN_MESSAGE,
  };
}

/** Approximate time under load per set, on top of rest. */
export const WORK_SECONDS_PER_SET = 40;

export function estimateMinutes(exercises: PlannedExercise[]): number {
  const seconds = exercises.reduce((sum, e) => sum + e.sets * (WORK_SECONDS_PER_SET + e.restSeconds), 0);
  return seconds / 60;
}

/**
 * Fits the session into the time available: drop isolation exercises from the end first,
 * then trim sets from the last compound backwards (never below 1 set). Rest is never cut.
 */
export function applyTimeLimit(exercises: PlannedExercise[], minutesAvailable: number): PlannedExercise[] {
  let plan = exercises.map((e) => ({ ...e, adjustments: [...e.adjustments] }));
  const isIsolation = (e: PlannedExercise) => getExercise(e.exerciseId).type === "isolation";

  while (estimateMinutes(plan) > minutesAvailable && plan.some(isIsolation)) {
    const last = plan.findLastIndex(isIsolation);
    plan = plan.filter((_, i) => i !== last);
  }

  for (let i = plan.length - 1; i >= 0 && estimateMinutes(plan) > minutesAvailable; i--) {
    const before = plan[i].sets;
    while (plan[i].sets > 1 && estimateMinutes(plan) > minutesAvailable) plan[i].sets--;
    if (plan[i].sets < before) plan[i].adjustments.push("Short on time: fewer sets, rest kept the same");
  }
  return plan;
}
