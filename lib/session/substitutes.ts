import { EXERCISES, getExercise } from "@/lib/exercises/library";
import { isAvailable } from "@/lib/engine/equipment";
import type { CheckIn, EquipmentSetup, Exercise } from "@/lib/engine/types";

const musclesOf = (e: Exercise) => [e.primaryMuscle, ...e.secondaryMuscles];

/**
 * Exercises Claude may swap `original` for: same main muscle and type (so the same sets, reps,
 * RIR and rest still fit), available with the user's equipment, not loading a painful area,
 * not already in today's session, and working no muscle the original doesn't (so a swap can
 * never add volume anywhere).
 */
export function substitutesFor(
  original: Exercise,
  setup: EquipmentSetup,
  painAreas: CheckIn["painAreas"],
  inSession: readonly string[],
): Exercise[] {
  const allowedMuscles = musclesOf(original);
  return EXERCISES.filter(
    (e) =>
      e.id !== original.id &&
      e.primaryMuscle === original.primaryMuscle &&
      e.type === original.type &&
      isAvailable(e, setup) &&
      !e.loadsAreas.some((a) => painAreas.includes(a)) &&
      !inSession.includes(e.id) &&
      e.secondaryMuscles.every((m) => allowedMuscles.includes(m)),
  );
}

/** Allowed substitute ids for every exercise in the session, keyed by the exercise's id. */
export function allowedSubstitutes(
  exerciseIds: readonly string[],
  setup: EquipmentSetup,
  painAreas: CheckIn["painAreas"],
): Record<string, string[]> {
  return Object.fromEntries(
    exerciseIds.map((id) => [id, substitutesFor(getExercise(id), setup, painAreas, exerciseIds).map((e) => e.id)]),
  );
}
