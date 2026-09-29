import { describe, expect, test } from "vitest";
import { getExercise } from "@/lib/exercises/library";
import { CALIBRATION_INSTRUCTION, estimateOneRepMax, startingLoad, startingLoadFor } from "./startingLoad";

describe("estimateOneRepMax (Epley)", () => {
  test("60 kg × 8 is about 76 kg", () => {
    expect(estimateOneRepMax(60, 8)).toBeCloseTo(76, 5);
  });

  test("1 rep returns the weight itself", () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
  });

  test("more reps at the same weight means a higher estimate", () => {
    expect(estimateOneRepMax(60, 12)).toBeGreaterThan(estimateOneRepMax(60, 5));
  });
});

describe("startingLoad", () => {
  test("reverses Epley with reps + RIR: 90 kg e1RM, 8 reps, RIR 2 → 67.5 kg", () => {
    // 90 / (1 + 10/30) = 67.5
    expect(startingLoad(90, 8, 2, 2.5)).toBe(67.5);
  });

  test("rounds DOWN to the increment, never up", () => {
    // 76 / (1 + 10/30) = 57 → 55 in both 5 kg and 2.5 kg steps
    expect(startingLoad(76, 8, 2, 5)).toBe(55);
    expect(startingLoad(76, 8, 2, 2.5)).toBe(55);
    expect(startingLoad(80, 8, 2, 2.5)).toBe(60);
    expect(startingLoad(82, 8, 2, 2.5)).toBe(60); // 61.5 → 60
  });

  test("keeps an exact multiple despite float error", () => {
    // 76 / (1 + 8/30) is exactly 60 on paper, but 59.999… in floating point.
    expect(startingLoad(estimateOneRepMax(60, 8), 6, 2, 2.5)).toBe(60);
  });

  test("never goes below the smallest increment", () => {
    expect(startingLoad(2, 10, 2, 2.5)).toBe(2.5);
    expect(startingLoad(3, 10, 2, 5)).toBe(5);
  });

  test("heavier for strength reps than for muscle reps (same e1RM)", () => {
    const strength = startingLoad(100, 6, 2, 2.5); // 100 / 1.2667 = 78.9 → 77.5
    const muscle = startingLoad(100, 10, 2, 2.5); // 100 / 1.4 = 71.4 → 70
    expect(strength).toBeGreaterThan(muscle);
  });
});

describe("startingLoadFor", () => {
  const bench = getExercise("barbell-bench-press");

  test("uses the TOP of the rep range with the target RIR: 5–10 at RIR 2 → 10 + 2 = 12", () => {
    const e1rm = estimateOneRepMax(60, 8); // 76
    const raw = e1rm / (1 + 12 / 30); // 54.29
    const result = startingLoadFor(bench, "muscle", { weightKg: 60, reps: 8 });
    expect(result).toEqual({ kind: "weight", kg: 52.5 });
    expect(result.kind === "weight" && result.kg).toBeLessThanOrEqual(raw);
    // Not the bottom (5 + 2 = 7) or middle of the range:
    expect(result.kind === "weight" && result.kg).toBeLessThan(startingLoad(e1rm, 7, 2, 2.5));
  });

  test("strength goal (3–6, RIR 2) uses 6 + 2 = 8, so it starts heavier than the muscle goal", () => {
    const strength = startingLoadFor(bench, "strength", { weightKg: 60, reps: 8 });
    const muscle = startingLoadFor(bench, "muscle", { weightKg: 60, reps: 8 });
    expect(strength).toEqual({ kind: "weight", kg: 60 }); // 76 / 1.2667 = 60
    expect(strength.kind === "weight" && muscle.kind === "weight" && strength.kg > muscle.kg).toBe(true);
  });

  test("isolation uses 20 reps + RIR 1", () => {
    const curl = getExercise("dumbbell-curl");
    const result = startingLoadFor(curl, "muscle", { weightKg: 10, reps: 12 });
    // e1RM 14 → 14 / (1 + 21/30) = 8.23 → 8 in 2 kg steps
    expect(result).toEqual({ kind: "weight", kg: 8 });
  });

  test("missing data gives a calibration marker with the instruction", () => {
    expect(startingLoadFor(bench, "muscle", undefined)).toEqual({
      kind: "calibration",
      instruction: "Pick a weight you could lift for about 10 reps with 2 left in reserve.",
    });
    expect(CALIBRATION_INSTRUCTION).toContain("10 reps with 2 left in reserve");
  });

  test("bodyweight exercises are always calibration (they progress by reps)", () => {
    const result = startingLoadFor(getExercise("pull-up"), "muscle", { weightKg: 10, reps: 5 });
    expect(result.kind).toBe("calibration");
  });

  test("a 1-rep max entry works", () => {
    // e1RM 100 → 100 / 1.4 = 71.4 → 70
    expect(startingLoadFor(bench, "muscle", { weightKg: 100, reps: 1 })).toEqual({ kind: "weight", kg: 70 });
  });
});
