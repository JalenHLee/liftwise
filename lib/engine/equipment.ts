import type { Equipment, EquipmentSetup, Exercise } from "./types";
import { EQUIPMENT } from "./types";

type SetupSpec = { equipment: Equipment[]; maxDumbbellKg?: number };

export const SETUPS: Record<EquipmentSetup, SetupSpec> = {
  full_gym: { equipment: [...EQUIPMENT] },
  // Squat rack, smith machine, incline + flat bench (barbell bench press station),
  // dumbbells up to 20 kg, shoulder press machine, single-stack cable,
  // cable row and lat pulldown. The smith bar doubles as a low bar for inverted rows.
  unit_gym: {
    equipment: [
      "barbell",
      "squat_rack",
      "flat_bench",
      "incline_bench",
      "dumbbells",
      "smith_machine",
      "cable",
      "cable_row",
      "lat_pulldown",
      "shoulder_press_machine",
      "low_bar",
    ],
    maxDumbbellKg: 20,
  },
  // No weights; assumes a pull-up bar and a sturdy low bar or table for rows and curls.
  bodyweight: { equipment: ["pullup_bar", "low_bar"] },
};

export function isAvailable(exercise: Exercise, setup: EquipmentSetup): boolean {
  const have = SETUPS[setup].equipment;
  return exercise.equipment.every((item) => have.includes(item));
}

/** Heaviest load the setup allows for this exercise, if there is a cap. */
export function maxLoadFor(exercise: Exercise, setup: EquipmentSetup): number | undefined {
  const cap = SETUPS[setup].maxDumbbellKg;
  return cap !== undefined && exercise.equipment.includes("dumbbells") ? cap : undefined;
}
