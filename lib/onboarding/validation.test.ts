import { describe, expect, test } from "vitest";
import { isValid, validateOnboarding, type OnboardingInput } from "./validation";

function baseInput(overrides: Partial<OnboardingInput> = {}): OnboardingInput {
  return {
    firstName: "Jalen",
    goal: "muscle",
    daysPerWeek: 4,
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
      baseInput({ startingWeights: { "back-squat": 60, deadlift: 80 } }),
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
      baseInput({ equipment: "bodyweight", startingWeights: { "back-squat": 60 } }),
    );
    expect(errors.startingWeights).toBeDefined();
  });

  test("rejects a non-positive starting weight", () => {
    const errors = validateOnboarding(baseInput({ startingWeights: { "back-squat": 0 } }));
    expect(errors.startingWeights).toBeDefined();
  });

  test("starting weights are optional", () => {
    expect(isValid(validateOnboarding(baseInput({ startingWeights: {} })))).toBe(true);
  });
});
