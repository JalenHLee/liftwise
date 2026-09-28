import { describe, expect, test } from "vitest";
import { getExercise } from "@/lib/exercises/library";
import { isAvailable } from "./equipment";
import { buildWeek } from "./templates";
import { MUSCLES, type EquipmentSetup, type Experience } from "./types";
import { MAX_SETS_PER_MUSCLE_PER_SESSION, sessionVolume, WEEKLY_SET_BANDS, weeklyVolume } from "./volume";

const EXPERIENCES: Experience[] = ["beginner", "intermediate", "advanced"];
const SETUPS: EquipmentSetup[] = ["full_gym", "unit_gym", "bodyweight"];
const DAYS = [2, 3, 4, 5, 6];
const ALL = DAYS.flatMap((d) => EXPERIENCES.flatMap((x) => SETUPS.map((s) => [d, x, s] as const)));

const names = (days: number) =>
  buildWeek({ daysPerWeek: days, experience: "beginner", equipment: "full_gym", goal: "muscle" }).sessions.map((s) => s.name);

describe("program templates", () => {
  test("2–3 days → Full Body", () => {
    expect(names(2)).toEqual(["Full Body", "Full Body"]);
    expect(names(3)).toEqual(["Full Body", "Full Body", "Full Body"]);
  });

  test("4 days → Upper/Lower", () => {
    expect(names(4)).toEqual(["Upper", "Lower", "Upper", "Lower"]);
  });

  test("5 days → Push, Pull, Legs, Upper, Lower; 6 days → Push/Pull/Legs twice", () => {
    expect(names(5)).toEqual(["Push", "Pull", "Legs", "Upper", "Lower"]);
    expect(names(6)).toEqual(["Push", "Pull", "Legs", "Push", "Pull", "Legs"]);
  });

  test("only 2–6 days are allowed", () => {
    for (const days of [1, 7, 3.5]) {
      expect(() => buildWeek({ daysPerWeek: days, experience: "beginner", equipment: "full_gym", goal: "muscle" })).toThrow();
    }
  });

  test.each(ALL)("%i days, %s, %s: every rule holds", (days, experience, equipment) => {
    const week = buildWeek({ daysPerWeek: days, experience, equipment, goal: "muscle" });
    const band = WEEKLY_SET_BANDS[experience];
    const weekly = weeklyVolume(week.sessions.map((s) => s.exercises));

    for (const m of MUSCLES) {
      // Weekly hard sets inside the band for this experience level
      expect(weekly[m], `${m} weekly sets`).toBeGreaterThanOrEqual(band.min);
      expect(weekly[m], `${m} weekly sets`).toBeLessThanOrEqual(band.max);
      // Trained at least twice a week (at least 1 hard set in 2+ sessions)
      const sessionsTrained = week.sessions.filter((s) => sessionVolume(s.exercises)[m] >= 1).length;
      expect(sessionsTrained, `${m} frequency`).toBeGreaterThanOrEqual(2);
    }

    for (const session of week.sessions) {
      const volume = sessionVolume(session.exercises);
      for (const m of MUSCLES) expect(volume[m], `${session.name} ${m}`).toBeLessThanOrEqual(MAX_SETS_PER_MUSCLE_PER_SESSION);
      for (const e of session.exercises) {
        expect(isAvailable(getExercise(e.exerciseId), equipment), e.exerciseId).toBe(true);
        expect(e.sets).toBeGreaterThan(0);
      }
      const ids = session.exercises.map((e) => e.exerciseId);
      expect(new Set(ids).size, "no repeated exercise in a session").toBe(ids.length);
    }
  });

  test("weekly volume bands: beginner 10–12, intermediate 12–16, advanced 14–20", () => {
    expect(WEEKLY_SET_BANDS).toEqual({
      beginner: { min: 10, max: 12 },
      intermediate: { min: 12, max: 16 },
      advanced: { min: 14, max: 20 },
    });
  });

  test("the goal sets the rep ranges: strength compounds use 3–6", () => {
    const week = buildWeek({ daysPerWeek: 3, experience: "beginner", equipment: "full_gym", goal: "strength" });
    const squat = week.sessions[0].exercises.find((e) => e.exerciseId === "back-squat")!;
    expect([squat.repMin, squat.repMax]).toEqual([3, 6]);
  });

  test("repeated days use different exercises where the equipment allows", () => {
    const week = buildWeek({ daysPerWeek: 4, experience: "intermediate", equipment: "full_gym", goal: "muscle" });
    const [upperA, , upperB] = week.sessions.map((s) => s.exercises.map((e) => e.exerciseId));
    expect(upperA).not.toEqual(upperB);
  });
});
