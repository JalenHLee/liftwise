import { EXERCISES } from "@/lib/exercises/library";
import { isAvailable } from "@/lib/engine/equipment";
import type { EquipmentSetup, Exercise } from "@/lib/engine/types";

/**
 * Key lifts with a starting weight worth asking for during onboarding.
 * Bodyweight-only key lifts (e.g. pull-up) progress by reps, not load
 * (Decision 8), so they're excluded here.
 */
export function weightedKeyLiftsFor(equipment: EquipmentSetup): Exercise[] {
  return EXERCISES.filter(
    (exercise) => exercise.keyLift && exercise.loadIncrementKg > 0 && isAvailable(exercise, equipment),
  );
}
