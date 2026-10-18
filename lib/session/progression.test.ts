import { describe, expect, test } from "vitest";
import { getExercise } from "@/lib/exercises/library";
import { exerciseHistory, type SetLog } from "@/lib/engine/history";
import type { LoggedSession } from "@/lib/engine/progression";
import { CALIBRATION_INSTRUCTION } from "@/lib/engine/startingLoad";
import type { CheckIn } from "@/lib/engine/types";
import { recommendedProgram } from "@/lib/program/program";
import { buildDraft, exerciseLoad, type DraftInput } from "./draft";
import { generateSession } from "./generate";
import { prefill, toRow } from "@/lib/logging/sets";
import { checkInvariants } from "./validate";

const green: CheckIn = { sleepHours: 8, energy: 4, soreness: {}, painAreas: [], minutesAvailable: 120 };
const base: DraftInput = {
  profile: { goal: "muscle", experience: "intermediate", equipment: "full_gym" },
  program: recommendedProgram({ experience: "intermediate", equipment: "full_gym", daysPerWeek: 4 }),
  dayIndex: 0, // Upper: bench 4 × 5–10 at RIR 2–3, ...
  checkIn: green,
  startingWeights: {},
  deload: { deload: false, reasons: [] },
};
const sessionOf = (kg: number, reps: number[], rir = 2): LoggedSession => ({ loadKg: kg, sets: reps.map((r) => ({ reps: r, rir, loadKg: kg })) });
const topOfRange = { "barbell-bench-press": [sessionOf(60, [10, 10, 10, 10])] };
const bench = (plan: ReturnType<typeof buildDraft>) => plan.exercises.find((e) => e.exerciseId === "barbell-bench-press")!;
const draft = (patch: Partial<DraftInput> = {}, checkIn: Partial<CheckIn> = {}) => buildDraft({ ...base, ...patch, checkIn: { ...green, ...checkIn } });

describe("today's weight comes from logged history", () => {
  test("history wins over the onboarding starting weight", () => {
    const e = bench(draft({ startingWeights: { "barbell-bench-press": { weightKg: 100, reps: 5 } }, history: { "barbell-bench-press": [sessionOf(60, [8, 8, 8, 8])] } }));
    expect(e.load).toEqual({ kind: "weight", kg: 60 });
    expect(e.targetReps).toBe(9);
  });

  test("green day, all sets at the top: +2.5 kg, tagged and explained", () => {
    const e = bench(draft({ history: topOfRange }));
    expect(e.load).toEqual({ kind: "weight", kg: 62.5 });
    expect(e.targetReps).toBe(5);
    expect(e.tags).toEqual(["+2.5 KG"]);
    expect(e.explanation).toBe("All sets at the top of the range, so add 2.5 kg.");
  });

  test("yellow day: the increase is held, with the real 'HELD · WAS DUE +2.5 KG' tag", () => {
    const e = bench(draft({ history: topOfRange }, { sleepHours: 5.5 }));
    expect(e.load).toEqual({ kind: "weight", kg: 60 });
    expect(e.tags).toContain("HELD · WAS DUE +2.5 KG");
    expect(e.explanation).toContain("Due +2.5 kg, held because it's a yellow day");
  });

  test("red day and deload week hold it too", () => {
    expect(bench(draft({ history: topOfRange }, { sleepHours: 4, energy: 1 })).tags).toContain("HELD · WAS DUE +2.5 KG");
    const deload = bench(draft({ history: topOfRange, deload: { deload: true, reasons: ["Scheduled deload every 6th week"] } }));
    expect(deload.load).toEqual({ kind: "weight", kg: 60 });
    expect(deload.explanation).toContain("held because it's a deload week");
  });

  test("the yellow day's easier RIR doesn't move the goalposts: progression judges against the program's target", () => {
    // Sets logged at RIR 2 meet the program's RIR 2–3, even though today (yellow) asks for RIR 3+.
    const e = bench(draft({ history: topOfRange }, { sleepHours: 5.5 }));
    expect(e.tags).toContain("HELD · WAS DUE +2.5 KG");
  });

  test("first set below the range two sessions in a row: −10%", () => {
    const e = bench(draft({ history: { "barbell-bench-press": [sessionOf(62.5, [4, 5, 5]), sessionOf(62.5, [4, 4, 4])] } }));
    expect(e.load).toEqual({ kind: "weight", kg: 55 });
    expect(e.tags).toEqual(["−10% WEIGHT"]);
  });

  test("unit gym dumbbells stop at 20 kg: 'AT MAX WEIGHT'", () => {
    const curl = getExercise("dumbbell-curl");
    const r = exerciseLoad(curl, { repMin: 10, repMax: 20, rirMin: 1 }, { profile: { ...base.profile, equipment: "unit_gym" }, startingWeights: {}, history: { "dumbbell-curl": [sessionOf(20, [20, 20])] } }, { level: "green", deload: false });
    expect(r).toMatchObject({ load: { kind: "weight", kg: 20 }, tag: "AT MAX WEIGHT" });
  });

  test("bodyweight with history: a rep target instead of weight", () => {
    const pushUp = getExercise("push-up");
    const r = exerciseLoad(pushUp, { repMin: 5, repMax: 10, rirMin: 2 }, { profile: base.profile, startingWeights: {}, history: { "push-up": [sessionOf(0, [10, 10, 10])] } }, { level: "green", deload: false });
    expect(r).toMatchObject({ load: { kind: "bodyweight" }, targetReps: 11, tag: "+1 REP" });
  });

  test("no history: starting weight or calibration, as before", () => {
    expect(bench(draft()).load).toEqual({ kind: "calibration", instruction: CALIBRATION_INSTRUCTION });
    expect(bench(draft()).targetReps).toBeUndefined();
  });

  test("the validator rejects a changed rep target", () => {
    const engine = draft({ history: topOfRange });
    const tampered = { ...engine, exercises: engine.exercises.map((e) => (e.exerciseId === "barbell-bench-press" ? { ...e, targetReps: 10 } : e)) };
    expect(checkInvariants(engine, tampered, [])).toContain("Barbell bench press: rep target changed");
  });
});

describe("calibration → first logged weight → progression", () => {
  test("the user picks a weight on set 1, later sets follow it, and next time progresses from it", () => {
    const day1 = bench(draft());
    expect(day1.load.kind).toBe("calibration");
    // Set 1 starts empty; the user enters 50 kg.
    expect(prefill(day1, 1, []).weightKg).toBeNull();
    const set1 = toRow("s1", day1, 1, { weightKg: 50, reps: 10, rir: 2 }, "a", "2026-10-05T10:00:00Z");
    expect(prefill(day1, 2, [set1]).weightKg).toBe(50);

    const logs: SetLog[] = [1, 2, 3, 4].map((n) => ({ exerciseId: "barbell-bench-press", sessionDate: "2026-10-05", isDeload: false, setNumber: n, weightKg: 50, reps: 10, rir: 2, loggedAt: "2026-10-05T10:00:00Z" }));
    const day2 = bench(draft({ history: { "barbell-bench-press": exerciseHistory(logs, "barbell-bench-press") } }));
    expect(day2.load).toEqual({ kind: "weight", kg: 52.5 });
    expect(day2.tags).toEqual(["+2.5 KG"]);
  });
});

describe("skipped exercises", () => {
  test("a skipped exercise (no sets) doesn't count: progression uses the last session it was done", () => {
    const logs: SetLog[] = [
      { exerciseId: "barbell-bench-press", sessionDate: "2026-10-01", isDeload: false, setNumber: 1, weightKg: 60, reps: 8, rir: 2, loggedAt: "x" },
    ];
    // 2026-10-05: bench was skipped, so nothing logged for it.
    const e = bench(draft({ history: { "barbell-bench-press": exerciseHistory(logs, "barbell-bench-press") } }));
    expect(e.load).toEqual({ kind: "weight", kg: 60 });
    expect(e.targetReps).toBe(9);
  });
});

describe("Claude swaps keep progression honest", () => {
  test("a swapped-in exercise gets its own load and tag, not the original's", async () => {
    const ai = async () =>
      JSON.stringify({
        swaps: [{ from: "barbell-bench-press", to: "dumbbell-bench-press", reason: "The bench is busy, so dumbbells today." }],
        addedPainAreas: [],
        addedSoreness: [],
        explanations: [],
        daySummary: "Green day.",
      });
    const result = await generateSession({ ...base, note: "bench is busy", history: topOfRange }, ai);
    const swapped = result.plan.exercises.find((e) => e.exerciseId === "dumbbell-bench-press")!;
    expect(result.source).toBe("ai");
    expect(swapped.tags).not.toContain("+2.5 KG");
    expect(swapped.tags).toContain("SWAPPED");
    expect(swapped.load.kind).toBe("calibration");
    expect(swapped.targetReps).toBeUndefined();
  });
});
