import { describe, expect, test } from "vitest";
import { getExercise } from "@/lib/exercises/library";
import { applyPain, applySoreness, applyTimeLimit, estimateMinutes, PAIN_MESSAGE } from "./modifiers";
import { prescribe, REST_LIMITS } from "./prescription";
import { applyReadiness } from "./readiness";

const plan = (id: string, sets: number) => prescribe(getExercise(id), "muscle", sets);

describe("soreness modifier", () => {
  test("a muscle at soreness 4+ has its sets halved; other muscles are untouched", () => {
    const [bench, squat] = applySoreness([plan("barbell-bench-press", 4), plan("back-squat", 4)], { chest: 4 });
    expect(bench.sets).toBe(2);
    expect(bench.adjustments[0]).toMatch(/chest/);
    expect(squat.sets).toBe(4);
  });

  test("soreness 3 does not halve sets", () => {
    const [bench] = applySoreness([plan("barbell-bench-press", 4)], { chest: 3 });
    expect(bench.sets).toBe(4);
  });

  test("stacks with a red day but never goes below 1 set", () => {
    const red = applyReadiness([plan("barbell-bench-press", 4)], "red");
    const [bench] = applySoreness(red, { chest: 5 });
    expect(bench.sets).toBe(1);
    const [again] = applySoreness([bench], { chest: 5 });
    expect(again.sets).toBe(1);
  });
});

describe("pain modifier", () => {
  const session = [
    plan("back-squat", 3),
    plan("leg-press", 3),
    plan("dumbbell-walking-lunge", 3),
    plan("leg-extension", 3),
    plan("barbell-bench-press", 3),
    plan("dumbbell-lateral-raise", 3),
  ];

  test("knee pain removes every exercise that loads the knee; bench stays", () => {
    const result = applyPain(session, ["knee"]);
    expect(result.removedIds.sort()).toEqual(["back-squat", "dumbbell-walking-lunge", "leg-extension", "leg-press"].sort());
    expect(result.exercises.map((e) => e.exerciseId)).toEqual(["barbell-bench-press", "dumbbell-lateral-raise"]);
    for (const e of result.exercises) expect(getExercise(e.exerciseId).loadsAreas).not.toContain("knee");
  });

  test("several pain areas remove both groups", () => {
    const result = applyPain(session, ["knee", "shoulder"]);
    expect(result.exercises).toEqual([]);
  });

  test("shows the medic/doctor message and never diagnoses", () => {
    const { message } = applyPain(session, ["knee"]);
    expect(message).toBe(PAIN_MESSAGE);
    expect(message).toContain("get it checked by a medic/doctor");
    expect(message).not.toContain("not medical advice");
    expect(message).not.toMatch(/injur|strain|sprain|tear|tendin|diagnos/i);
  });

  test("no pain → nothing removed and no message", () => {
    const result = applyPain(session, []);
    expect(result.exercises).toEqual(session);
    expect(result.message).toBeNull();
  });
});

describe("time modifier", () => {
  const session = [
    plan("back-squat", 4),
    plan("barbell-bench-press", 4),
    plan("barbell-row", 4),
    plan("leg-extension", 3),
    plan("dumbbell-curl", 3),
    plan("cable-pushdown", 3),
  ];
  const ids = (list: { exerciseId: string }[]) => list.map((e) => e.exerciseId);

  test("enough time → no change", () => {
    expect(applyTimeLimit(session, 90)).toEqual(session);
  });

  test("short on time drops isolation exercises from the end first and keeps every compound", () => {
    const full = estimateMinutes(session);
    const oneCurlLess = full - estimateMinutes([plan("cable-pushdown", 3)]);
    const result = applyTimeLimit(session, oneCurlLess);
    expect(ids(result)).toEqual(["back-squat", "barbell-bench-press", "barbell-row", "leg-extension", "dumbbell-curl"]);
    expect(result.find((e) => e.exerciseId === "back-squat")!.sets).toBe(4);
  });

  test("if compounds alone don't fit, the last compound loses sets first, never below 1", () => {
    const result = applyTimeLimit(session, 25);
    expect(ids(result)).toEqual(["back-squat", "barbell-bench-press", "barbell-row"]);
    expect(result.map((e) => e.sets)).toEqual([4, 2, 1]);
    expect(estimateMinutes(result)).toBeLessThanOrEqual(25);

    const tiny = applyTimeLimit(session, 1);
    expect(tiny.map((e) => e.sets)).toEqual([1, 1, 1]);
  });

  test("rest is never cut below the minimums (120 s compound, 60 s isolation)", () => {
    for (const minutes of [90, 40, 25, 1]) {
      for (const e of applyTimeLimit(session, minutes)) {
        expect(e.restSeconds).toBeGreaterThanOrEqual(REST_LIMITS[getExercise(e.exerciseId).type].min);
      }
    }
  });
});
