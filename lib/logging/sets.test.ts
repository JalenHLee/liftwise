import { describe, expect, test } from "vitest";
import { buildDraft } from "@/lib/session/draft";
import { recommendedProgram } from "@/lib/program/program";
import type { SessionExercise, SessionPlan } from "@/lib/session/types";
import { canResume, nextSet, parseWeight, prefill, setProblem, stepReps, stepWeight, summarize, toRow, validateFinish } from "./sets";
import { clock, restExpired, restLeft } from "./rest";

const ex = (patch: Partial<SessionExercise> = {}): SessionExercise => ({
  exerciseId: "barbell-bench-press",
  name: "Barbell bench press",
  sets: 3,
  repMin: 5,
  repMax: 10,
  rirMin: 2,
  rirMax: 3,
  restSeconds: 150,
  adjustments: [],
  load: { kind: "weight", kg: 60 },
  tags: [],
  explanation: null,
  ...patch,
});
const row = (n: number, kg: number | null, reps = 8, exerciseId = "barbell-bench-press") =>
  toRow("s1", ex({ exerciseId }), n, { weightKg: kg, reps, rir: 2 }, `id-${exerciseId}-${n}`, "2026-10-09T10:00:00Z");

describe("prefilled set rows", () => {
  test("planned weight, the rep target, and the RIR pill at the target (one tap logs an on-plan set)", () => {
    expect(prefill(ex(), 1, [])).toEqual({ weightKg: 60, reps: 10, rir: 2 });
    expect(prefill(ex({ targetReps: 8 }), 1, [])).toEqual({ weightKg: 60, reps: 8, rir: 2 });
    expect(prefill(ex({ rirMin: 3, rirMax: 4 }), 1, []).rir).toBe(3);
    expect(prefill(ex({ rirMin: 4, rirMax: 4 }), 1, []).rir).toBe(4);
  });

  test("later sets follow the weight actually used", () => {
    expect(prefill(ex(), 2, [row(1, 62.5)]).weightKg).toBe(62.5);
  });

  test("calibration: set 1 is empty, later sets follow what the user entered", () => {
    const calib = ex({ load: { kind: "calibration", instruction: "…" } });
    expect(prefill(calib, 1, []).weightKg).toBeNull();
    expect(prefill(calib, 2, [row(1, 40)]).weightKg).toBe(40);
  });

  test("bodyweight has no weight", () => {
    expect(prefill(ex({ exerciseId: "push-up", load: { kind: "bodyweight" } }), 1, []).weightKg).toBeNull();
  });
});

describe("editing values", () => {
  test("−/+ moves by the increment, never below one increment; empty starts at one", () => {
    expect(stepWeight(60, 2.5, 1)).toBe(62.5);
    expect(stepWeight(2.5, 2.5, -1)).toBe(2.5);
    expect(stepWeight(null, 2, 1)).toBe(2);
    expect(stepWeight(61, 2.5, 1)).toBe(63.5);
    expect(stepReps(0, -1)).toBe(0);
    expect(stepReps(8, 1)).toBe(9);
  });

  test("typed weights accept a comma and reject nonsense", () => {
    expect(parseWeight("62,5")).toBe(62.5);
    expect(parseWeight(" 60 ")).toBe(60);
    expect(parseWeight("abc")).toBeNull();
    expect(parseWeight("1e3")).toBeNull();
  });

  test("a weighted set needs a weight; reps 0–100; a valid RIR", () => {
    expect(setProblem(ex(), { weightKg: null, reps: 8, rir: 2 })).toBe("Enter the weight you used.");
    expect(setProblem(ex(), { weightKg: Number.NaN, reps: 8, rir: 2 })).toBe("That weight doesn't look right.");
    expect(setProblem(ex(), { weightKg: 60, reps: Number.NaN, rir: 2 })).toMatch(/Reps/);
    expect(setProblem(ex(), { weightKg: 60, reps: 8, rir: 5 })).toMatch(/reserve/);
    expect(setProblem(ex(), { weightKg: 60, reps: 0, rir: 0 })).toBeNull();
    expect(setProblem(ex({ exerciseId: "push-up", load: { kind: "bodyweight" } }), { weightKg: null, reps: 12, rir: 1 })).toBeNull();
  });

  test("bodyweight sets are saved without a weight", () => {
    expect(toRow("s1", ex({ exerciseId: "push-up", load: { kind: "bodyweight" } }), 1, { weightKg: 20, reps: 12, rir: 1 }, "x", "t").weight_kg).toBeNull();
  });
});

const plan = (): SessionPlan =>
  buildDraft({
    profile: { goal: "muscle", experience: "intermediate", equipment: "full_gym" },
    program: recommendedProgram({ experience: "intermediate", equipment: "full_gym", daysPerWeek: 4 }),
    dayIndex: 0,
    checkIn: { sleepHours: 8, energy: 4, soreness: {}, painAreas: [], minutesAvailable: 120 },
    startingWeights: {},
    deload: { deload: false, reasons: [] },
  });

describe("moving through the session", () => {
  test("the next set is the first unlogged one, skipping skipped exercises", () => {
    const p = plan();
    const [first, second] = p.exercises;
    expect(nextSet(p, [], [])).toEqual({ exerciseId: first.exerciseId, setNumber: 1 });
    expect(nextSet(p, [row(1, 60, 8, first.exerciseId)], [])).toEqual({ exerciseId: first.exerciseId, setNumber: 2 });
    // Set 2 deleted by mistake: it's next again.
    expect(nextSet(p, [row(1, 60, 8, first.exerciseId), row(3, 60, 8, first.exerciseId)], [])).toEqual({ exerciseId: first.exerciseId, setNumber: 2 });
    expect(nextSet(p, [], [first.exerciseId])).toEqual({ exerciseId: second.exerciseId, setNumber: 1 });
    expect(nextSet(p, [], p.exercises.map((e) => e.exerciseId))).toBeNull();
  });
});

describe("end-of-workout summary", () => {
  test("partial session with a skipped exercise: sets done, volume, lifts", () => {
    const p = plan();
    const [first, second] = p.exercises;
    const sets = [row(1, 60, 10, first.exerciseId), row(2, 60, 8, first.exerciseId), row(1, null, 10, "pull-up")];
    const s = summarize(p, sets, [second.exerciseId]);
    expect(s).toEqual({
      setsDone: 3,
      setsPlanned: p.exercises.reduce((n, e) => n + e.sets, 0),
      volumeKg: 60 * 10 + 60 * 8,
      liftsDone: 2,
      liftsPlanned: p.exercises.length,
      skipped: 1,
    });
  });

  test("nothing logged is still a valid (empty) summary", () => {
    expect(summarize(plan(), [], [])).toMatchObject({ setsDone: 0, volumeKg: 0, liftsDone: 0 });
  });

  test("rating 1–5 required, note optional and trimmed", () => {
    expect(validateFinish({ rating: 4, note: "  felt strong " })).toEqual({ rating: 4, note: "felt strong" });
    expect(validateFinish({ rating: 3, note: "" })).toEqual({ rating: 3, note: null });
    expect(validateFinish({ rating: 0, note: "" })).toHaveProperty("error");
    expect(validateFinish({ rating: "5", note: "" })).toHaveProperty("error");
    expect(validateFinish({ rating: 5, note: "x".repeat(501) })).toHaveProperty("error");
  });

  test("resume only on the session's own local day", () => {
    expect(canResume("2026-10-09", "2026-10-09")).toBe(true);
    expect(canResume("2026-10-09", "2026-10-10")).toBe(false);
  });
});

describe("rest timer", () => {
  const rest = { startedAt: 1_000_000, seconds: 150, next: "Set 2" };
  test("counts down from timestamps (a locked phone doesn't pause it)", () => {
    expect(restLeft(rest, 1_000_000)).toBe(150);
    expect(restLeft(rest, 1_000_000 + 42_500)).toBe(108);
    expect(restLeft(rest, 1_000_000 + 999_000)).toBe(0);
    expect(clock(108)).toBe("1:48");
    expect(clock(60)).toBe("1:00");
  });

  test("closes a few seconds after 'Rest done'", () => {
    expect(restExpired(rest, 1_000_000 + 150_000)).toBe(false);
    expect(restExpired(rest, 1_000_000 + 156_000)).toBe(true);
  });
});
