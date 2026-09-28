import { describe, expect, test } from "vitest";
import { getExercise } from "@/lib/exercises/library";
import { applyDeload, checkDeload, isStalled, type DeloadInput } from "./deload";
import { prescribe } from "./prescription";

const base: DeloadInput = { weekSinceLastDeload: 1, weeklyBests: {}, checkIns: [], today: "2026-03-10" };
const deload = (overrides: Partial<DeloadInput>) => checkDeload({ ...base, ...overrides }).deload;

const stalled = [
  { loadKg: 100, reps: 8 },
  { loadKg: 100, reps: 8 },
  { loadKg: 100, reps: 7 },
];
const improving = [
  { loadKg: 100, reps: 8 },
  { loadKg: 100, reps: 9 },
  { loadKg: 102.5, reps: 6 },
];

describe("deload triggers", () => {
  test("nothing going on → no deload", () => {
    expect(checkDeload(base)).toEqual({ deload: false, reasons: [] });
  });

  test("every 6th week counted from the last deload: week 6 yes, week 5 no", () => {
    expect(deload({ weekSinceLastDeload: 6 })).toBe(true);
    expect(deload({ weekSinceLastDeload: 5 })).toBe(false);
  });

  test("an early deload resets the count (week 6 after it deloads again, not calendar week 12)", () => {
    // Early deload happened in week 4; 6 weeks later is week 10 of the program.
    expect(deload({ weekSinceLastDeload: 6 })).toBe(true);
    expect(deload({ weekSinceLastDeload: 2 })).toBe(false);
  });

  test("a lift is stalled when neither of the last 2 weeks beat the best before them", () => {
    expect(isStalled(stalled)).toBe(true);
    expect(isStalled(improving)).toBe(false);
    expect(isStalled(stalled.slice(0, 2))).toBe(false);
  });

  test("2 or more stalled key lifts → deload; 1 → no deload", () => {
    expect(deload({ weeklyBests: { "back-squat": stalled, "barbell-bench-press": stalled } })).toBe(true);
    expect(deload({ weeklyBests: { "back-squat": stalled, "barbell-bench-press": improving } })).toBe(false);
  });

  test("stalled non-key lifts don't count", () => {
    expect(deload({ weeklyBests: { "leg-press": stalled, "dumbbell-curl": stalled, "back-squat": stalled } })).toBe(false);
  });

  test("3 or more red days in the last 7 days → deload; 2 → no deload", () => {
    const red = (date: string) => ({ date, level: "red" as const });
    expect(deload({ checkIns: [red("2026-03-04"), red("2026-03-07"), red("2026-03-10")] })).toBe(true);
    expect(deload({ checkIns: [red("2026-03-07"), red("2026-03-10")] })).toBe(false);
  });

  test("red days spread over more than 7 days don't count", () => {
    const red = (date: string) => ({ date, level: "red" as const });
    // 2026-03-02 is 8 days before 2026-03-10.
    expect(deload({ checkIns: [red("2026-03-02"), red("2026-03-06"), red("2026-03-10")] })).toBe(false);
    expect(deload({ checkIns: [red("2026-03-06"), red("2026-03-08"), { date: "2026-03-10", level: "yellow" }] })).toBe(false);
  });
});

describe("deload effects", () => {
  test("half the sets, 4 reps in reserve; weight is held by progression", () => {
    const [squat, curl] = applyDeload([
      prescribe(getExercise("back-squat"), "muscle", 4),
      prescribe(getExercise("dumbbell-curl"), "muscle", 3),
    ]);
    expect(squat).toMatchObject({ sets: 2, rirMin: 4, rirMax: 4 });
    expect(curl).toMatchObject({ sets: 2, rirMin: 4, rirMax: 4 });
    expect(squat.adjustments[0]).toMatch(/Deload/);
  });
});
