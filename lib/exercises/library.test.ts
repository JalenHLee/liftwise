import { describe, expect, test } from "vitest";
import { isAvailable, maxLoadFor } from "@/lib/engine/equipment";
import { EQUIPMENT, MOVEMENT_PATTERNS, MUSCLES, PAIN_AREAS, type Muscle } from "@/lib/engine/types";
import { EXERCISES, getExercise } from "./library";

const LOWER_BODY: Muscle[] = ["quads", "hamstrings", "glutes", "calves"];

describe("exercise library", () => {
  test("has about 40 exercises with unique IDs", () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(35);
    expect(EXERCISES.length).toBeLessThanOrEqual(45);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
  });

  test("every field uses an allowed value", () => {
    for (const e of EXERCISES) {
      expect(MUSCLES).toContain(e.primaryMuscle);
      for (const m of e.secondaryMuscles) expect(MUSCLES).toContain(m);
      expect(e.secondaryMuscles).not.toContain(e.primaryMuscle);
      expect(MOVEMENT_PATTERNS).toContain(e.pattern);
      for (const item of e.equipment) expect(EQUIPMENT).toContain(item);
      for (const area of e.loadsAreas) expect(PAIN_AREAS).toContain(area);
      expect(e.loadsAreas.length).toBeGreaterThan(0);
      expect(["compound", "isolation"]).toContain(e.type);
      expect(e.loadIncrementKg).toBeGreaterThanOrEqual(0);
    }
  });

  test("upper-body barbell lifts go up 2.5 kg, lower-body barbell lifts 5 kg", () => {
    expect(getExercise("barbell-bench-press").loadIncrementKg).toBe(2.5);
    expect(getExercise("back-squat").loadIncrementKg).toBe(5);
    for (const e of EXERCISES.filter((e) => e.equipment.includes("barbell"))) {
      expect(e.loadIncrementKg).toBe(LOWER_BODY.includes(e.primaryMuscle) ? 5 : 2.5);
    }
  });

  test("dumbbell exercises use the smallest dumbbell step, 2 kg", () => {
    for (const e of EXERCISES.filter((e) => e.equipment.includes("dumbbells"))) {
      expect(e.loadIncrementKg).toBe(2);
    }
  });

  test("bodyweight-only exercises have no load increment", () => {
    for (const e of EXERCISES.filter((e) => e.equipment.length === 0)) {
      expect(e.loadIncrementKg).toBe(0);
    }
  });

  test("key lifts are squat, bench, deadlift, overhead press, barbell row and pull-up", () => {
    expect(EXERCISES.filter((e) => e.keyLift).map((e) => e.id).sort()).toEqual(
      ["back-squat", "barbell-bench-press", "barbell-row", "deadlift", "overhead-press", "pull-up"].sort(),
    );
  });

  test.each(["full_gym", "unit_gym", "bodyweight"] as const)("%s can train every muscle", (setup) => {
    for (const m of MUSCLES) {
      expect(EXERCISES.some((e) => e.primaryMuscle === m && isAvailable(e, setup)), m).toBe(true);
    }
  });

  test("unit gym has no leg press, leg extension or leg curl machine", () => {
    for (const id of ["leg-press", "leg-extension", "leg-curl", "machine-calf-raise", "dip"]) {
      expect(isAvailable(getExercise(id), "unit_gym"), id).toBe(false);
    }
    for (const id of ["back-squat", "barbell-bench-press", "smith-calf-raise", "lat-pulldown", "seated-cable-row", "machine-shoulder-press", "cable-pushdown", "incline-dumbbell-press"]) {
      expect(isAvailable(getExercise(id), "unit_gym"), id).toBe(true);
    }
  });

  test("unit gym dumbbells are capped at 20 kg; the full gym has no cap", () => {
    expect(maxLoadFor(getExercise("dumbbell-curl"), "unit_gym")).toBe(20);
    expect(maxLoadFor(getExercise("back-squat"), "unit_gym")).toBeUndefined();
    expect(maxLoadFor(getExercise("dumbbell-curl"), "full_gym")).toBeUndefined();
  });

  test("getExercise rejects unknown IDs", () => {
    expect(() => getExercise("made-up")).toThrow();
  });
});
