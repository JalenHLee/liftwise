import { describe, expect, test } from "vitest";
import { details, readinessTags, repsPerSet, rirTarget, setsByReps, weightLabel } from "./display";
import type { SessionExercise, SessionPlan } from "./types";

const base: SessionExercise = {
  exerciseId: "barbell-bench-press",
  name: "Barbell bench press",
  sets: 3,
  repMin: 5,
  repMax: 10,
  rirMin: 2,
  rirMax: 3,
  restSeconds: 150,
  adjustments: [],
  load: { kind: "weight", kg: 65 },
  tags: [],
  explanation: null,
};

describe("session display", () => {
  test("with a starting weight: one target (top of range) and the range in small print", () => {
    expect(setsByReps(base)).toBe("3 × 10");
    expect(repsPerSet(base)).toBe("10 reps");
    expect(weightLabel(base)).toBe("65 kg");
    expect(details(base)).toEqual(["Range 5–10", "RIR 2–3", "Rest 2:30"]);
  });

  test("calibration and bodyweight show the range only", () => {
    const calib: SessionExercise = { ...base, load: { kind: "calibration", instruction: "Pick a weight…" } };
    expect(setsByReps(calib)).toBe("3 × 5–10");
    expect(repsPerSet(calib)).toBe("5–10 reps");
    expect(weightLabel(calib)).toBeNull();
    expect(details(calib)).toEqual(["RIR 2–3", "Rest 2:30"]);
    expect(weightLabel({ ...base, load: { kind: "bodyweight" } })).toBe("Bodyweight");
    expect(setsByReps({ ...base, load: { kind: "bodyweight" } })).toBe("3 × 5–10");
  });

  test("half kilos and single RIR values", () => {
    expect(weightLabel({ ...base, load: { kind: "weight", kg: 22.5 } })).toBe("22.5 kg");
    expect(details({ ...base, rirMin: 4, rirMax: 4, restSeconds: 90 })).toEqual(["Range 5–10", "RIR 4", "Rest 1:30"]);
  });

  test("the day's RIR target and readiness tags", () => {
    const plan = {
      exercises: [base, { ...base, rirMin: 1, rirMax: 2 }],
      deload: { deload: true, reasons: [] },
      readiness: { level: "yellow", tags: ["5.5h sleep"] },
      fromNote: { painAreas: ["lower_back"], soreness: { chest: 4 } },
    } as unknown as SessionPlan;
    expect(rirTarget(plan)).toBe("1–3");
    expect(readinessTags(plan)).toEqual(["deload week", "5.5h sleep", "note: lower back pain", "note: sore chest"]);
  });
});

describe("progression targets (slice 6)", () => {
  test("a progression rep target replaces the top of the range, with the range in small mono", () => {
    const e = { ...base, targetReps: 8 };
    expect(setsByReps(e)).toBe("3 × 8");
    expect(repsPerSet(e)).toBe("8 reps");
    expect(details(e)[0]).toBe("Range 5–10");
  });

  test("bodyweight with history shows its rep target", () => {
    const e: SessionExercise = { ...base, load: { kind: "bodyweight" }, targetReps: 11 };
    expect(setsByReps(e)).toBe("3 × 11");
    expect(details(e)[0]).toBe("Range 5–10");
  });
});
