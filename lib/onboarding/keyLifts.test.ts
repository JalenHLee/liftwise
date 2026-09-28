import { describe, expect, test } from "vitest";
import { weightedKeyLiftsFor } from "./keyLifts";

describe("weightedKeyLiftsFor", () => {
  test("full gym gets all 5 loaded key lifts (pull-up is bodyweight, excluded)", () => {
    const ids = weightedKeyLiftsFor("full_gym").map((e) => e.id).sort();
    expect(ids).toEqual(
      ["back-squat", "barbell-bench-press", "barbell-row", "deadlift", "overhead-press"].sort(),
    );
  });

  test("unit gym has a squat rack and barbell, so it gets the same 5 lifts", () => {
    const ids = weightedKeyLiftsFor("unit_gym").map((e) => e.id).sort();
    expect(ids).toEqual(
      ["back-squat", "barbell-bench-press", "barbell-row", "deadlift", "overhead-press"].sort(),
    );
  });

  test("bodyweight has no barbell, so there's nothing to weigh in on", () => {
    expect(weightedKeyLiftsFor("bodyweight")).toEqual([]);
  });
});
