import { describe, expect, test } from "vitest";
import { getExercise } from "@/lib/exercises/library";
import { isAvailable } from "@/lib/engine/equipment";
import { checkProgram, type ProgramCheck } from "@/lib/engine/programCheck";
import { buildWeek, RECOMMENDED_SPLIT, SPLITS, SPLIT_DAYS, splitCycle, splitsFor } from "@/lib/engine/templates";
import { GOALS, MUSCLES, type EquipmentSetup, type Experience } from "@/lib/engine/types";
import { MAX_SETS_PER_MUSCLE_PER_SESSION, sessionVolume } from "@/lib/engine/volume";
import pre5c from "./__fixtures__/pre5c-weeks.json";
import { programNotes } from "./notes";
import { checkFor, generateProgram, isRolling, parseProgram, prescribeDay, recommendedProgram, resolveProgram } from "./program";

const EXPERIENCES: Experience[] = ["beginner", "intermediate", "advanced"];
const SETUPS: EquipmentSetup[] = ["full_gym", "unit_gym", "bodyweight"];
const DAYS = [2, 3, 4, 5, 6];
const ALL = DAYS.flatMap((d) => EXPERIENCES.flatMap((x) => SETUPS.map((s) => [d, x, s] as const)));
const ALL_SPLITS = ALL.flatMap(([d, x, s]) => splitsFor(d).map((split) => [split, d, x, s] as const));

describe("template programs match the pre-5c week builder", () => {
  // The fixture is the old builder's output for every combination, captured before slice 5c.
  test.each(ALL)("%i days, %s, %s: same days, exercises and sets", (daysPerWeek, experience, equipment) => {
    const program = recommendedProgram({ daysPerWeek, experience, equipment });
    const asText = program.days.map((d) => `${d.name}: ${d.exercises.map((e) => `${e.exerciseId}×${e.sets}`).join(", ")}`);
    expect(asText).toEqual((pre5c as Record<string, string[]>)[`${daysPerWeek}/${experience}/${equipment}`]);
    expect(program).toMatchObject({ source: "template", split: RECOMMENDED_SPLIT[daysPerWeek] });
  });

  test.each(GOALS)("goal %s: prescribing a stored day gives the same plan as the week builder", (goal) => {
    for (const [daysPerWeek, experience, equipment] of ALL) {
      const week = buildWeek({ daysPerWeek, experience, equipment, goal });
      const program = recommendedProgram({ daysPerWeek, experience, equipment });
      expect(program.days.map((d) => ({ name: d.name, exercises: prescribeDay(d, goal) }))).toEqual(week.sessions);
    }
  });
});

describe("split choice", () => {
  test("splits on offer for each number of days, the recommended one first", () => {
    expect(splitsFor(2)).toEqual(["full_body", "upper_lower"]);
    expect(splitsFor(3)).toEqual(["full_body", "upper_lower", "push_pull_legs"]);
    expect(splitsFor(4)).toEqual(["upper_lower", "full_body", "push_pull_legs"]);
    expect(splitsFor(5)).toEqual(["push_pull_legs_upper_lower", "full_body", "upper_lower", "push_pull_legs"]);
    expect(splitsFor(6)).toEqual(["push_pull_legs", "upper_lower"]);
    expect(splitsFor(7)).toEqual([]);
  });

  test("Push/Pull/Legs is offered on 3–6 days and Upper/Lower on 2–6", () => {
    expect(SPLIT_DAYS.push_pull_legs).toEqual([3, 4, 5, 6]);
    expect(SPLIT_DAYS.upper_lower).toEqual([2, 3, 4, 5, 6]);
  });

  test("a split that fits the week is one week; otherwise it rolls over a fixed cycle", () => {
    expect(splitCycle("upper_lower", 2)).toEqual(["upper", "lower"]);
    expect(splitCycle("upper_lower", 6)).toEqual(["upper", "lower", "upper", "lower", "upper", "lower"]);
    expect(splitCycle("upper_lower", 3)).toEqual(["upper", "lower", "upper", "lower"]);
    expect(splitCycle("push_pull_legs", 3)).toEqual(["push", "pull", "legs"]);
    expect(splitCycle("push_pull_legs", 4)).toEqual(["push", "pull", "legs", "push", "pull", "legs"]);
    expect(isRolling("push_pull_legs", 4)).toBe(true);
    expect(isRolling("upper_lower", 4)).toBe(false);
    for (const split of SPLITS) for (const d of SPLIT_DAYS[split]) expect(isRolling(split, d)).toBe(splitCycle(split, d).length !== d);
  });

  test("generating a split for days it isn't offered on is an error", () => {
    expect(() => generateProgram("push_pull_legs", { daysPerWeek: 2, experience: "beginner", equipment: "full_gym" })).toThrow();
    expect(() => generateProgram("push_pull_legs_upper_lower", { daysPerWeek: 4, experience: "beginner", equipment: "full_gym" })).toThrow();
  });

  test.each(ALL_SPLITS)("%s on %i days, %s, %s: safe and available", (split, daysPerWeek, experience, equipment) => {
    const program = generateProgram(split, { daysPerWeek, experience, equipment });
    for (const day of program.days) {
      const volume = sessionVolume(prescribeDay(day, "muscle"));
      for (const v of Object.values(volume)) expect(v).toBeLessThanOrEqual(MAX_SETS_PER_MUSCLE_PER_SESSION);
      for (const e of day.exercises) expect(isAvailable(getExercise(e.exerciseId), equipment)).toBe(true);
    }
    // Never over the weekly band on average.
    const check = checkFor(program, { daysPerWeek, experience });
    expect(check.issues.filter((i) => i.kind === "above_band" || i.kind === "session_cap")).toEqual([]);
  });

  test.each(ALL)("recommended split on %i days, %s, %s: no tradeoff notes", (daysPerWeek, experience, equipment) => {
    const program = recommendedProgram({ daysPerWeek, experience, equipment });
    expect(programNotes(checkFor(program, { daysPerWeek, experience }))).toEqual([]);
  });

  test("a rolling split aims for the weekly band on average", () => {
    const setup = { daysPerWeek: 4, experience: "beginner" as const, equipment: "full_gym" as const };
    const check = checkFor(generateProgram("push_pull_legs", setup), setup);
    // 6-day cycle on 4 days: 10 chest sets a week needs 15 per cycle.
    expect(check.muscles.chest.setsPerWeek).toBeGreaterThanOrEqual(10);
    expect(check.muscles.chest.setsPerWeek).toBeLessThanOrEqual(12);
  });
});

describe("program check: average weekly frequency and volume", () => {
  const day = (exerciseId: string, sets: number) => ({ exercises: [{ exerciseId, sets }] });

  test("a cycle that matches the week counts as written", () => {
    const check = checkProgram({ days: [day("barbell-bench-press", 5), day("barbell-bench-press", 5)], daysPerWeek: 2, experience: "beginner" });
    expect(check.muscles.chest).toEqual({ timesPerWeek: 2, setsPerWeek: 10, maxPerSession: 5 });
  });

  test("a rolling cycle is scaled to an average week: PPL on 4 days ≈ 1.3× a week", () => {
    const setup = { daysPerWeek: 4, experience: "beginner" as const, equipment: "full_gym" as const };
    const check = checkFor(generateProgram("push_pull_legs", setup), setup);
    expect(check.muscles.chest.timesPerWeek).toBe(1.3);
    expect(check.muscles.quads.timesPerWeek).toBe(1.3);
  });

  test("Upper/Lower on 3 days ≈ 1.5× a week; on 6 days 3×", () => {
    const three = { daysPerWeek: 3, experience: "beginner" as const, equipment: "full_gym" as const };
    expect(checkFor(generateProgram("upper_lower", three), three).muscles.chest.timesPerWeek).toBe(1.5);
    const six = { ...three, daysPerWeek: 6 };
    expect(checkFor(generateProgram("upper_lower", six), six).muscles.chest.timesPerWeek).toBe(3);
  });

  test("flags low frequency, volume outside the band, untrained muscles and the session cap", () => {
    const check = checkProgram({ days: [day("barbell-bench-press", 11)], daysPerWeek: 1, experience: "beginner" });
    const kinds = check.issues.map((i) => i.kind);
    expect(kinds).toEqual(["untrained", "low_frequency", "below_band", "session_cap"]);
  });
});

describe("tradeoff notes come from the check", () => {
  const notesFor = (split: Parameters<typeof generateProgram>[0], daysPerWeek: number, experience: Experience = "beginner") => {
    const setup = { daysPerWeek, experience, equipment: "full_gym" as const };
    return programNotes(checkFor(generateProgram(split, setup), setup));
  };

  test("PPL on 3 days: trained about once a week", () => {
    expect(notesFor("push_pull_legs", 3)[0]).toBe("Trains most muscles once a week (twice is the target).");
  });

  test("PPL on 4 days: the average, not a hard-coded line", () => {
    expect(notesFor("push_pull_legs", 4)).toEqual(["Trains most muscles about 1.3 times a week (twice is the target)."]);
  });

  test("volume below the band names the target", () => {
    expect(notesFor("upper_lower", 2, "advanced")).toContain("Every muscle gets 10 sets a week, below your 14–20 target.");
  });

  test("a split that meets every rule has no notes", () => {
    expect(notesFor("upper_lower", 6)).toEqual([]);
    expect(notesFor("full_body", 4)).toEqual([]);
  });

  test("untrained muscles and a band shortfall for most muscles", () => {
    const d = { exercises: [{ exerciseId: "barbell-bench-press", sets: 5 }, { exerciseId: "barbell-row", sets: 5 }, { exerciseId: "back-squat", sets: 5 }] };
    expect(programNotes(checkProgram({ days: [d, d], daysPerWeek: 2, experience: "beginner" }))).toEqual([
      "Hamstrings, calves and core aren't trained with your equipment.",
      "Most muscles get 5 sets a week, below your 10–12 target.",
    ]);
  });

  test("a shortfall under 1 set a week is no warning, but the check keeps the exact numbers", () => {
    // Upper/Lower on 2 days, beginner: some muscles land on 9.5 of 10 (half sets from secondary muscles).
    const setup = { daysPerWeek: 2, experience: "beginner" as const, equipment: "full_gym" as const };
    const check = checkFor(generateProgram("upper_lower", setup), setup);
    const below = check.issues.find((i) => i.kind === "below_band");
    expect(below?.kind === "below_band" && below.muscles.map((m) => m.setsPerWeek)).toContain(9.5);
    expect(programNotes(check)).toEqual(["Trains most muscles once a week (twice is the target)."]);
  });

  test("volume notes show whole sets and start at a full set short or over", () => {
    const week = (setsPerWeek: number) => ({ timesPerWeek: 2, setsPerWeek, maxPerSession: 6 });
    const muscles = Object.fromEntries(MUSCLES.map((m) => [m, week(11)])) as ProgramCheck["muscles"];
    const band = { min: 10, max: 12 };
    const below = (sets: number[]) =>
      programNotes({ muscles, issues: [{ kind: "below_band", band, muscles: sets.map((s, i) => ({ muscle: (["chest", "back"] as const)[i], setsPerWeek: s })) }] });
    expect(below([9.1])).toEqual([]);
    expect(below([9])).toEqual(["Chest gets 9 sets a week, below your 10–12 target."]);
    expect(below([8.6, 9.9])).toEqual(["Chest gets 9 sets a week, below your 10–12 target."]);
    expect(below([7.3, 8.5])).toEqual(["Chest and back get 7–9 sets a week, below your 10–12 target."]);
    const above = (s: number) => programNotes({ muscles, issues: [{ kind: "above_band", band, muscles: [{ muscle: "chest", setsPerWeek: s }] }] });
    expect(above(12.5)).toEqual([]);
    expect(above(13.4)).toEqual(["Chest gets 13 sets a week, above your 10–12 target."]);
  });

  test("names a few muscles, with the right verb", () => {
    const week = (setsPerWeek: number) => ({ timesPerWeek: 2, setsPerWeek, maxPerSession: 6 });
    const muscles = Object.fromEntries(MUSCLES.map((m) => [m, week(11)])) as ProgramCheck["muscles"];
    const band = { min: 10, max: 12 };
    const one = programNotes({ muscles, issues: [{ kind: "below_band", band, muscles: [{ muscle: "chest", setsPerWeek: 8 }] }] });
    expect(one).toEqual(["Chest gets 8 sets a week, below your 10–12 target."]);
    const two = programNotes({ muscles, issues: [{ kind: "above_band", band, muscles: [{ muscle: "glutes", setsPerWeek: 13 }, { muscle: "core", setsPerWeek: 14 }] }] });
    expect(two).toEqual(["Glutes and core get 13–14 sets a week, above your 10–12 target."]);
    const plural = programNotes({ muscles, issues: [{ kind: "low_frequency", muscles: [{ muscle: "calves", timesPerWeek: 1 }] }] });
    expect(plural).toEqual(["Trains calves once a week (twice is the target)."]);
  });
});

describe("stored programs", () => {
  const setup = { daysPerWeek: 4, experience: "beginner" as const, equipment: "full_gym" as const };
  const program = recommendedProgram(setup);

  test("a stored program reads back exactly", () => {
    expect(parseProgram(JSON.parse(JSON.stringify(program)))).toEqual(program);
    const custom = { name: "Mine", source: "custom", split: null, days: [{ name: "A", exercises: [{ exerciseId: "deadlift", sets: 3, repMin: 3, repMax: 5 }] }] };
    expect(parseProgram(custom)).toEqual(custom);
  });

  test.each([
    ["an unknown exercise", { days: [{ name: "A", exercises: [{ exerciseId: "nope", sets: 3 }] }] }],
    ["too many sets", { days: [{ name: "A", exercises: [{ exerciseId: "deadlift", sets: 11 }] }] }],
    ["a backwards rep range", { days: [{ name: "A", exercises: [{ exerciseId: "deadlift", sets: 3, repMin: 8, repMax: 5 }] }] }],
    ["only one rep bound", { days: [{ name: "A", exercises: [{ exerciseId: "deadlift", sets: 3, repMin: 8 }] }] }],
    ["an empty day", { days: [{ name: "A", exercises: [] }] }],
    ["no days", { days: [] }],
    ["an unknown split", { split: "bro_split" }],
    ["an unknown source", { source: "ai" }],
  ])("rejects %s", (_label, patch) => {
    expect(parseProgram({ ...program, ...patch })).toBeNull();
  });

  test("first use: no stored program -> the recommended template, to be saved", () => {
    expect(resolveProgram(null, setup)).toEqual({ program, rotationResetAt: null, needsSave: true });
  });

  test("a stored program is used as it is", () => {
    const ppl = generateProgram("push_pull_legs", setup);
    expect(resolveProgram({ ...ppl, rotation_reset_at: "2026-10-01T00:00:00Z" }, setup)).toEqual({
      program: ppl,
      rotationResetAt: "2026-10-01T00:00:00Z",
      needsSave: false,
    });
  });
});
