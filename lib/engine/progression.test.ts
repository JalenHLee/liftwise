import { describe, expect, test } from "vitest";
import { getExercise } from "@/lib/exercises/library";
import { prescribe } from "./prescription";
import { nextProgression, type LoggedSession } from "./progression";

const bench = getExercise("barbell-bench-press");
const squat = getExercise("back-squat");
const dbPress = getExercise("dumbbell-bench-press");
const pushUp = getExercise("push-up");
const target = prescribe(bench, "muscle", 3); // 5–10 reps, RIR 2–3

const session = (loadKg: number, reps: number[], rir = 2): LoggedSession => ({
  loadKg,
  sets: reps.map((r) => ({ reps: r, rir })),
});
const green = { allowIncrease: true };

describe("double progression", () => {
  test("all sets at the top of the range at target RIR, upper body → +2.5 kg", () => {
    const r = nextProgression(bench, target, [session(60, [10, 10, 10])], green);
    expect(r).toMatchObject({ loadKg: 62.5, change: "increase", targetReps: 5 });
  });

  test("same for lower body → +5 kg", () => {
    const r = nextProgression(squat, target, [session(100, [10, 10, 10])], green);
    expect(r).toMatchObject({ loadKg: 105, change: "increase" });
  });

  test("uses the exercise's own smallest increment (dumbbells +2 kg)", () => {
    const r = nextProgression(dbPress, target, [session(20, [10, 10, 10])], green);
    expect(r.loadKg).toBe(22);
  });

  test("top reps but harder than the target RIR → no increase", () => {
    const r = nextProgression(bench, target, [session(60, [10, 10, 10], 0)], green);
    expect(r).toMatchObject({ loadKg: 60, change: "hold" });
  });

  test("within the range → same weight, aim for one more rep", () => {
    const r = nextProgression(bench, target, [session(60, [8, 8, 8])], green);
    expect(r).toMatchObject({ loadKg: 60, targetReps: 9, change: "hold" });
  });

  test("mixed sets (10, 10, 9) count as within the range", () => {
    const r = nextProgression(bench, target, [session(60, [10, 10, 9])], green);
    expect(r).toMatchObject({ loadKg: 60, targetReps: 10, change: "hold" });
  });

  test("first set below the range once → no cut yet", () => {
    const r = nextProgression(bench, target, [session(60, [8, 8, 8]), session(60, [4, 4, 3])], green);
    expect(r).toMatchObject({ loadKg: 60, targetReps: 5, change: "hold" });
  });

  test("first set below the range 2 sessions in a row → weight drops 10%, rounded down to the increment", () => {
    const r = nextProgression(bench, target, [session(62.5, [4, 4, 4]), session(62.5, [4, 3, 3])], green);
    // 62.5 × 0.9 = 56.25 → rounded down to 2.5 kg steps = 55
    expect(r).toMatchObject({ loadKg: 55, change: "decrease", targetReps: 5 });
  });

  test("only the FIRST set counts: later sets below the range don't make a bad session", () => {
    const r = nextProgression(bench, target, [session(60, [6, 4, 3]), session(60, [5, 4, 3])], green);
    expect(r).toMatchObject({ loadKg: 60, change: "hold" });
  });

  test("the 2 bad sessions must be back to back (bad, OK, bad → no cut)", () => {
    const r = nextProgression(bench, target, [session(60, [4, 4, 4]), session(60, [6, 6, 5]), session(60, [4, 4, 4])], green);
    expect(r.change).toBe("hold");
  });

  test("no weight increase on a yellow/red day or deload week, even when ready", () => {
    const r = nextProgression(bench, target, [session(60, [10, 10, 10])], { allowIncrease: false });
    expect(r).toMatchObject({ loadKg: 60, change: "hold" });
  });

  test("never goes above the heaviest weight available (unit gym 20 kg dumbbells)", () => {
    const r = nextProgression(dbPress, target, [session(20, [10, 10, 10])], { allowIncrease: true, maxLoadKg: 20 });
    expect(r).toMatchObject({ loadKg: 20, change: "hold" });
  });

  test("bodyweight exercises progress by raising the rep target", () => {
    const pushUpTarget = prescribe(pushUp, "muscle", 3);
    const ready = nextProgression(pushUp, pushUpTarget, [session(0, [10, 10, 10])], green);
    expect(ready).toMatchObject({ loadKg: 0, targetReps: 11, change: "more_reps" });
    const within = nextProgression(pushUp, pushUpTarget, [session(0, [7, 7, 6])], green);
    expect(within).toMatchObject({ targetReps: 7, change: "hold" });
  });

  test("needs at least one logged session", () => {
    expect(() => nextProgression(bench, target, [], green)).toThrow();
  });
});
