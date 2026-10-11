import { describe, expect, test } from "vitest";
import { checkDeload } from "./deload";
import { exerciseHistory, historyByExercise, weekStart, weeklyBests, type SetLog } from "./history";
import { deloadToday } from "@/lib/session/schedule";

const log = (exerciseId: string, sessionDate: string, setNumber: number, weightKg: number | null, reps: number, patch: Partial<SetLog> = {}): SetLog => ({
  exerciseId,
  sessionDate,
  isDeload: false,
  setNumber,
  weightKg,
  reps,
  rir: 2,
  loggedAt: `${sessionDate}T10:0${setNumber}:00Z`,
  ...patch,
});

/** Three sets of `reps` at `kg` on `date`. */
const session = (id: string, date: string, kg: number, reps: number, patch: Partial<SetLog> = {}) =>
  [1, 2, 3].map((n) => log(id, date, n, kg, reps, patch));

describe("exercise history from logged sets", () => {
  test("groups sets by session, oldest first, in set order; the first set's weight is the working weight", () => {
    const logs = [log("barbell-bench-press", "2026-10-05", 2, 60, 8), log("barbell-bench-press", "2026-10-01", 1, 57.5, 10), log("barbell-bench-press", "2026-10-05", 1, 60, 9)];
    expect(exerciseHistory(logs, "barbell-bench-press")).toEqual([
      { loadKg: 57.5, sets: [{ reps: 10, rir: 2, loadKg: 57.5 }] },
      { loadKg: 60, sets: [{ reps: 9, rir: 2, loadKg: 60 }, { reps: 8, rir: 2, loadKg: 60 }] },
    ]);
  });

  test("leaves out deload sessions and other exercises", () => {
    const logs = [...session("barbell-bench-press", "2026-10-01", 60, 8), ...session("barbell-bench-press", "2026-10-03", 60, 10, { isDeload: true }), ...session("back-squat", "2026-10-02", 100, 5)];
    expect(exerciseHistory(logs, "barbell-bench-press")).toHaveLength(1);
    expect(Object.keys(historyByExercise(logs)).sort()).toEqual(["back-squat", "barbell-bench-press"]);
  });

  test("bodyweight sets have no weight", () => {
    expect(exerciseHistory([log("push-up", "2026-10-01", 1, null, 12)], "push-up")[0]).toEqual({ loadKg: 0, sets: [{ reps: 12, rir: 2, loadKg: 0 }] });
  });
});

describe("weeks run Monday to Sunday", () => {
  test("Monday through Sunday share a week; the next Monday starts a new one", () => {
    // 2026-10-05 is a Monday, 2026-10-11 a Sunday.
    expect(weekStart("2026-10-11")).toBe(weekStart("2026-10-05"));
    expect(weekStart("2026-10-12")).toBe(weekStart("2026-10-05") + 7);
    expect(new Date(weekStart("2026-10-08") * 86_400_000).toISOString().slice(0, 10)).toBe("2026-10-05");
  });
});

describe("weekly bests and stall detection", () => {
  const TODAY = "2026-10-26"; // a Monday
  // Three finished weeks: 2026-10-05, 10-12, 10-19.
  test("best set per finished week, heavier first, then more reps; the current week doesn't count", () => {
    const logs = [
      log("back-squat", "2026-10-06", 1, 100, 5),
      log("back-squat", "2026-10-06", 2, 95, 9),
      log("back-squat", "2026-10-13", 1, 100, 6),
      log("back-squat", "2026-10-26", 1, 120, 5),
    ];
    expect(weeklyBests(logs, TODAY)).toEqual({ "back-squat": [{ loadKg: 100, reps: 5 }, { loadKg: 100, reps: 6 }] });
  });

  test("weeks without the lift are left out, not counted as a stall", () => {
    const logs = [...session("back-squat", "2026-09-28", 100, 6), ...session("back-squat", "2026-10-19", 100, 5)];
    expect(weeklyBests(logs, TODAY)["back-squat"]).toHaveLength(2);
  });

  test("deload sessions are ignored", () => {
    const logs = [...session("back-squat", "2026-10-06", 100, 6), ...session("back-squat", "2026-10-13", 100, 6, { isDeload: true })];
    expect(weeklyBests(logs, TODAY)["back-squat"]).toHaveLength(1);
  });

  const stalled = (id: string) => [...session(id, "2026-10-06", 100, 6), ...session(id, "2026-10-13", 100, 6), ...session(id, "2026-10-20", 100, 5)];
  const progressing = (id: string) => [...session(id, "2026-10-06", 100, 6), ...session(id, "2026-10-13", 100, 7), ...session(id, "2026-10-20", 102.5, 6)];

  test("2 key lifts stalled for 2 weeks -> deload", () => {
    const bests = weeklyBests([...stalled("back-squat"), ...stalled("barbell-bench-press")], TODAY);
    expect(checkDeload({ weekSinceLastDeload: 3, weeklyBests: bests, checkIns: [], today: TODAY })).toEqual({
      deload: true,
      reasons: ["2 or more key lifts have stalled for 2 weeks"],
    });
  });

  test("one stalled key lift, or stalled non-key lifts, -> no deload", () => {
    const one = weeklyBests([...stalled("back-squat"), ...progressing("barbell-bench-press")], TODAY);
    expect(checkDeload({ weekSinceLastDeload: 3, weeklyBests: one, checkIns: [], today: TODAY }).deload).toBe(false);
    const nonKey = weeklyBests([...stalled("leg-press"), ...stalled("dumbbell-bench-press")], TODAY);
    expect(checkDeload({ weekSinceLastDeload: 3, weeklyBests: nonKey, checkIns: [], today: TODAY }).deload).toBe(false);
  });

  test("the session schedule passes weekly bests through to the deload check", () => {
    const bests = weeklyBests([...stalled("back-squat"), ...stalled("deadlift")], TODAY);
    const result = deloadToday({ today: TODAY, sessionDates: ["2026-10-06"], deloadDates: [], checkIns: [], weeklyBests: bests });
    expect(result.reasons).toContain("2 or more key lifts have stalled for 2 weeks");
  });
});
