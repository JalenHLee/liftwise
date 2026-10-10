import { describe, expect, test } from "vitest";
import { getExercise } from "@/lib/exercises/library";
import { CALIBRATION_INSTRUCTION } from "@/lib/engine/startingLoad";
import type { CheckIn } from "@/lib/engine/types";
import { buildDraft, loadFor, mergeCheckIn, programDay, type DraftInput } from "./draft";
import { allowedSubstitutes } from "./substitutes";
import { generateProgram, recommendedProgram } from "@/lib/program/program";

const green: CheckIn = { sleepHours: 8, energy: 4, soreness: {}, painAreas: [], minutesAvailable: 90 };
const base: DraftInput = {
  profile: { goal: "muscle", experience: "intermediate", equipment: "full_gym" },
  program: recommendedProgram({ experience: "intermediate", equipment: "full_gym", daysPerWeek: 4 }),
  dayIndex: 0,
  checkIn: green,
  startingWeights: {},
  deload: { deload: false, reasons: [] },
};
const draft = (patch: Partial<DraftInput> = {}, checkIn: Partial<CheckIn> = {}) =>
  buildDraft({ ...base, ...patch, checkIn: { ...green, ...checkIn } });
const ex = (plan: ReturnType<typeof buildDraft>, id: string) => plan.exercises.find((e) => e.exerciseId === id)!;

describe("draft plan assembly", () => {
  test("a green day is the template day as written, with no tags or explanations", () => {
    const plan = draft();
    const template = programDay(base.program, "muscle", 0);
    expect(plan.dayName).toBe("Upper");
    expect(plan.template).toBe("upper_lower");
    expect(plan.dayCount).toBe(4);
    expect(plan.exercises.map((e) => [e.exerciseId, e.sets])).toEqual(template.exercises.map((e) => [e.exerciseId, e.sets]));
    expect(plan.exercises.every((e) => e.tags.length === 0 && e.explanation === null)).toBe(true);
    expect(plan.summary).toMatch(/^Green day/);
    expect(plan.estimatedMinutes).toBeGreaterThan(0);
  });

  test("uses the requested day of the stored program", () => {
    expect(draft({ dayIndex: 1 }).dayName).toBe("Lower");
    const ppl = generateProgram("push_pull_legs", { experience: "intermediate", equipment: "full_gym", daysPerWeek: 4 });
    expect(draft({ program: ppl, dayIndex: 2 })).toMatchObject({ dayName: "Legs", template: "push_pull_legs", dayCount: 6 });
  });

  test("builds from the stored days, sets and rep overrides, not from the template", () => {
    const custom = {
      name: "Mine",
      source: "custom" as const,
      split: null,
      days: [{ name: "Bench day", exercises: [{ exerciseId: "barbell-bench-press", sets: 5, repMin: 3, repMax: 5 }, { exerciseId: "cable-fly", sets: 2 }] }],
    };
    const plan = draft({ program: custom, dayIndex: 3 });
    expect(plan).toMatchObject({ dayName: "Bench day", template: "custom", dayIndex: 0, dayCount: 1 });
    expect(plan.exercises.map((e) => [e.exerciseId, e.sets, e.repMin, e.repMax])).toEqual([
      ["barbell-bench-press", 5, 3, 5],
      ["cable-fly", 2, 10, 20],
    ]);
  });

  test("only uses exercises the equipment allows", () => {
    const setup = { experience: "intermediate" as const, equipment: "bodyweight" as const, daysPerWeek: 4 };
    const plan = draft({ profile: { ...base.profile, equipment: "bodyweight" }, program: recommendedProgram(setup) });
    for (const e of plan.exercises) expect(getExercise(e.exerciseId).equipment.every((q) => ["pullup_bar", "low_bar"].includes(q))).toBe(true);
  });

  test("a yellow day takes a set off and tags the cause", () => {
    const full = draft();
    const plan = draft({}, { sleepHours: 5.5 });
    const bench = ex(plan, "barbell-bench-press");
    expect(bench.sets).toBe(ex(full, "barbell-bench-press").sets - 1);
    expect(bench.rirMin).toBeGreaterThanOrEqual(3);
    expect(bench.tags).toEqual(["−1 SET · SLEEP"]);
    expect(bench.adjustments[0]).toMatch(/Yellow day/);
    expect(bench.explanation).toBeNull(); // explained once on the readiness card, not per exercise
    expect(draft({}, { energy: 2 }).exercises[0].tags).toEqual(["−1 SET · ENERGY"]);
  });

  test("stacks deload then readiness, never below 1 set", () => {
    const plan = draft({ deload: { deload: true, reasons: ["Scheduled deload every 6th week"] } }, { sleepHours: 5.5 });
    for (const e of plan.exercises) {
      expect(e.sets).toBeGreaterThanOrEqual(1);
      expect(e.tags[0]).toBe("DELOAD");
      expect(e.rirMin).toBe(4);
    }
    expect(plan.summary).toMatch(/^Deload week/);
  });

  test("pain removes every exercise loading that area and shows the medic message", () => {
    const plan = draft({}, { painAreas: ["shoulder"] });
    expect(plan.exercises.some((e) => getExercise(e.exerciseId).loadsAreas.includes("shoulder"))).toBe(false);
    expect(plan.removedForPain.map((e) => e.id)).toContain("barbell-bench-press");
    expect(plan.painMessage).toMatch(/medic\/doctor/);
  });

  test("a very sore muscle gets half the sets and a tag naming it", () => {
    const plan = draft({}, { soreness: { chest: 4 } });
    const bench = ex(plan, "barbell-bench-press");
    expect(bench.sets).toBe(Math.ceil(ex(draft(), "barbell-bench-press").sets / 2));
    expect(bench.tags).toContain("½ SETS · SORE CHEST");
    expect(bench.explanation).toBe("Your chest is very sore, so sets are halved.");
  });

  test("short on time drops isolation work first and tags trimmed sets", () => {
    const plan = draft({}, { minutesAvailable: 30 });
    expect(plan.estimatedMinutes).toBeLessThanOrEqual(30);
    expect(plan.droppedForTime.length).toBeGreaterThan(0);
    expect(plan.droppedForTime.every((e) => getExercise(e.id).type === "isolation")).toBe(true);
    expect(plan.summary).toMatch(/fit your time/);
  });

  test("weights: starting load for lifts with a last solid set, calibration otherwise, bodyweight for bodyweight", () => {
    const plan = draft({ startingWeights: { "barbell-bench-press": { weightKg: 80, reps: 5 } } });
    expect(ex(plan, "barbell-bench-press").load).toEqual({ kind: "weight", kg: 65 });
    expect(ex(plan, "overhead-press").load).toEqual({ kind: "calibration", instruction: CALIBRATION_INSTRUCTION });
    expect(ex(plan, "pull-up").load).toEqual({ kind: "bodyweight" });
  });

  test("unit gym caps dumbbell weights at 20 kg", () => {
    const db = getExercise("dumbbell-bench-press");
    const strong = { weightKg: 60, reps: 8 };
    expect(loadFor(db, "muscle", "full_gym", strong)).toEqual({ kind: "weight", kg: 54 });
    expect(loadFor(db, "muscle", "unit_gym", strong)).toEqual({ kind: "weight", kg: 20 });
    expect(loadFor(getExercise("barbell-bench-press"), "muscle", "unit_gym", strong).kind).toBe("weight");
  });
});

describe("note additions", () => {
  test("only ever raise soreness and add pain areas", () => {
    const merged = mergeCheckIn({ ...green, soreness: { quads: 4 }, painAreas: ["knee"] }, { painAreas: ["knee", "wrist"], soreness: { quads: 2, chest: 3 } });
    expect(merged.soreness).toEqual({ quads: 4, chest: 3 });
    expect(merged.painAreas).toEqual(["knee", "wrist"]);
  });
});

describe("allowed substitutes", () => {
  test("same muscle and type, available, pain-free, not already in the session, adds no muscles", () => {
    const plan = draft();
    const ids = plan.exercises.map((e) => e.exerciseId);
    const allowed = allowedSubstitutes(ids, "full_gym", []);
    const bench = getExercise("barbell-bench-press");
    for (const id of allowed["barbell-bench-press"]) {
      const sub = getExercise(id);
      expect(sub.primaryMuscle).toBe(bench.primaryMuscle);
      expect(sub.type).toBe(bench.type);
      expect(ids).not.toContain(id);
      expect(sub.secondaryMuscles.every((m) => [bench.primaryMuscle, ...bench.secondaryMuscles].includes(m))).toBe(true);
    }
    expect(allowed["barbell-bench-press"]).toContain("dumbbell-bench-press");
  });

  test("leaves out anything loading a painful area or missing equipment", () => {
    const allowed = allowedSubstitutes(["back-squat"], "unit_gym", ["knee"]);
    expect(allowed["back-squat"]).toEqual([]);
    expect(allowedSubstitutes(["back-squat"], "unit_gym", [])["back-squat"]).not.toContain("leg-press");
  });
});
