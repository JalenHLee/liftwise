import { describe, expect, test } from "vitest";
import { getExercise } from "@/lib/exercises/library";
import { prescribe } from "./prescription";

describe("reps, effort and rest", () => {
  test("compounds: 5–10 reps, RIR 2–3, rest within 120–180 s", () => {
    const p = prescribe(getExercise("back-squat"), "muscle", 3);
    expect([p.repMin, p.repMax, p.rirMin, p.rirMax]).toEqual([5, 10, 2, 3]);
    expect(p.restSeconds).toBeGreaterThanOrEqual(120);
    expect(p.restSeconds).toBeLessThanOrEqual(180);
  });

  test("strength goal: compounds use 3–6 reps", () => {
    const p = prescribe(getExercise("back-squat"), "strength", 3);
    expect([p.repMin, p.repMax]).toEqual([3, 6]);
  });

  test("isolation: 10–20 reps, RIR 1–2, rest within 60–120 s, whatever the goal", () => {
    for (const goal of ["strength", "muscle", "general"] as const) {
      const p = prescribe(getExercise("dumbbell-curl"), goal, 3);
      expect([p.repMin, p.repMax, p.rirMin, p.rirMax]).toEqual([10, 20, 1, 2]);
      expect(p.restSeconds).toBeGreaterThanOrEqual(60);
      expect(p.restSeconds).toBeLessThanOrEqual(120);
    }
  });
});
