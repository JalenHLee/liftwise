import { describe, expect, test } from "vitest";
import { isValid, parseStartingSets, validateOnboarding, type OnboardingInput } from "./validation";

function baseInput(overrides: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    firstName: "Jalen",
    goal: "muscle",
    daysPerWeek: 4,
    split: "upper_lower",
    sessionMinutes: 60,
    equipment: "full_gym",
    experience: "intermediate",
    startingWeights: {},
    ...overrides,
  };
}

describe("validateOnboarding", () => {
  test("accepts a fully valid submission", () => {
    expect(isValid(validateOnboarding(baseInput()))).toBe(true);
  });

  test("accepts valid starting weights for the chosen equipment", () => {
    const errors = validateOnboarding(
      baseInput({ startingWeights: { "back-squat": { weightKg: 60, reps: 8 }, deadlift: { weightKg: 80, reps: 5 } } }),
    );
    expect(isValid(errors)).toBe(true);
  });

  test("requires a first name", () => {
    const errors = validateOnboarding(baseInput({ firstName: "  " }));
    expect(errors.firstName).toBeDefined();
  });

  test("rejects an unknown goal", () => {
    const errors = validateOnboarding(baseInput({ goal: "bulk" }));
    expect(errors.goal).toBeDefined();
  });

  test("rejects a days-per-week outside 2-6", () => {
    expect(validateOnboarding(baseInput({ daysPerWeek: 1 })).daysPerWeek).toBeDefined();
    expect(validateOnboarding(baseInput({ daysPerWeek: 7 })).daysPerWeek).toBeDefined();
  });

  test("accepts any split offered for the days, rejects the rest", () => {
    expect(isValid(validateOnboarding(baseInput({ daysPerWeek: 4, split: "push_pull_legs" })))).toBe(true);
    expect(isValid(validateOnboarding(baseInput({ daysPerWeek: 3, split: "push_pull_legs" })))).toBe(true);
    expect(validateOnboarding(baseInput({ daysPerWeek: 2, split: "push_pull_legs" })).split).toBeDefined();
    expect(validateOnboarding(baseInput({ daysPerWeek: 4, split: "push_pull_legs_upper_lower" })).split).toBeDefined();
    expect(validateOnboarding(baseInput({ split: "bro_split" })).split).toBeDefined();
  });

  test("rejects a session length that isn't one of the tap options", () => {
    const errors = validateOnboarding(baseInput({ sessionMinutes: 50 }));
    expect(errors.sessionMinutes).toBeDefined();
  });

  test("rejects an unknown equipment setup", () => {
    const errors = validateOnboarding(baseInput({ equipment: "home_gym" }));
    expect(errors.equipment).toBeDefined();
  });

  test("rejects an unknown experience level", () => {
    const errors = validateOnboarding(baseInput({ experience: "pro" }));
    expect(errors.experience).toBeDefined();
  });

  test("rejects a starting weight for a lift not available on that equipment", () => {
    // pull-up is bodyweight-only and back-squat needs a barbell + rack
    const errors = validateOnboarding(
      baseInput({ equipment: "bodyweight", startingWeights: { "back-squat": { weightKg: 60, reps: 8 } } }),
    );
    expect(errors.startingWeights).toBeDefined();
  });

  test("rejects a non-positive starting weight", () => {
    const errors = validateOnboarding(baseInput({ startingWeights: { "back-squat": { weightKg: 0, reps: 8 } } }));
    expect(errors.startingWeights).toBeDefined();
  });

  test.each([1, 10, 12])("accepts %i reps", (reps) => {
    const input = baseInput({ startingWeights: { "back-squat": { weightKg: 60, reps } } });
    expect(isValid(validateOnboarding(input))).toBe(true);
  });

  test.each([0, 13, 5.5, -3, Number.NaN])("rejects %s reps", (reps) => {
    const input = baseInput({ startingWeights: { "back-squat": { weightKg: 60, reps } } });
    expect(validateOnboarding(input).startingWeights).toBeDefined();
  });

  test("starting weights are optional", () => {
    expect(isValid(validateOnboarding(baseInput({ startingWeights: {} })))).toBe(true);
  });
});

describe("parseStartingSets", () => {
  test("skips lifts where both boxes are empty", () => {
    expect(parseStartingSets({ "back-squat": { weight: "", reps: " " } })).toEqual({ sets: {} });
  });

  test("reads weight and reps as numbers, accepting a decimal comma", () => {
    expect(parseStartingSets({ "back-squat": { weight: "62,5", reps: "8" } })).toEqual({
      sets: { "back-squat": { weightKg: 62.5, reps: 8 } },
    });
  });

  test("errors when only one of weight or reps is filled in", () => {
    expect(parseStartingSets({ deadlift: { weight: "80", reps: "" } }).error).toBe(
      "Add both weight and reps, or leave both empty.",
    );
    expect(parseStartingSets({ deadlift: { weight: "", reps: "5" } }).error).toBeDefined();
  });
});
