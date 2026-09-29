import { describe, expect, test } from "vitest";
import { getExercise } from "@/lib/exercises/library";
import { prescribe } from "./prescription";
import { applyReadiness, scoreReadiness } from "./readiness";
import type { CheckIn } from "./types";

const checkIn = (overrides: Partial<CheckIn> = {}): CheckIn => ({
  sleepHours: 7.5,
  energy: 4,
  soreness: { chest: 2 },
  painAreas: [],
  minutesAvailable: 60,
  ...overrides,
});

const level = (overrides: Partial<CheckIn>) => scoreReadiness(checkIn(overrides)).level;

describe("readiness tags", () => {
  test("green days have no tags", () => {
    expect(scoreReadiness(checkIn()).tags).toEqual([]);
  });

  test("tags name each trigger in short form", () => {
    const result = scoreReadiness(checkIn({ sleepHours: 5.5, energy: 2, soreness: { quads: 3, chest: 2, back: 5 } }));
    expect(result.tags).toEqual(["5.5h sleep", "energy 2/5", "sore back", "sore quads"]);
  });

  test("whole hours drop the decimal", () => {
    expect(scoreReadiness(checkIn({ sleepHours: 5 })).tags).toEqual(["5h sleep"]);
  });
});

describe("readiness scoring", () => {
  test("green: good sleep, good energy, little soreness → plan as written, progression allowed", () => {
    const result = scoreReadiness(checkIn());
    expect(result.level).toBe("green");
    expect(result.progressionAllowed).toBe(true);
  });

  test("yellow if sleep is under 6 h; exactly 6 h is green", () => {
    expect(level({ sleepHours: 5.5 })).toBe("yellow");
    expect(level({ sleepHours: 6 })).toBe("green");
  });

  test("yellow if energy is 2 or lower; 3 is green", () => {
    expect(level({ energy: 2 })).toBe("yellow");
    expect(level({ energy: 3 })).toBe("green");
  });

  test("yellow if any muscle is at soreness 3 or higher", () => {
    expect(level({ soreness: { quads: 3 } })).toBe("yellow");
    expect(level({ soreness: { quads: 4 } })).toBe("yellow");
  });

  test("red if sleep under 5 h AND energy 2 or lower; low sleep alone is only yellow", () => {
    expect(level({ sleepHours: 4.5, energy: 2 })).toBe("red");
    expect(level({ sleepHours: 4.5, energy: 3 })).toBe("yellow");
  });

  test("red if 3 or more muscles are at soreness 4+; 2 muscles is only yellow", () => {
    expect(level({ soreness: { chest: 4, back: 4, quads: 5 } })).toBe("red");
    expect(level({ soreness: { chest: 4, back: 4 } })).toBe("yellow");
  });

  test("red wins when a check-in meets both yellow and red conditions", () => {
    const result = scoreReadiness(checkIn({ sleepHours: 4, energy: 1, soreness: { chest: 3 } }));
    expect(result.level).toBe("red");
    expect(result.progressionAllowed).toBe(false);
  });

  test("progression is blocked on yellow days", () => {
    expect(scoreReadiness(checkIn({ energy: 2 })).progressionAllowed).toBe(false);
  });
});

describe("readiness effects", () => {
  const squat = prescribe(getExercise("back-squat"), "muscle", 4);
  const curl = prescribe(getExercise("dumbbell-curl"), "muscle", 1);

  test("green changes nothing", () => {
    expect(applyReadiness([squat], "green")).toEqual([squat]);
  });

  test("yellow: one fewer set, at least 3 reps in reserve, never below 1 set", () => {
    const [s, c] = applyReadiness([squat, curl], "yellow");
    expect(s.sets).toBe(3);
    expect(s.rirMin).toBeGreaterThanOrEqual(3);
    expect(c.sets).toBe(1);
    expect(c.rirMin).toBeGreaterThanOrEqual(3);
    expect(c.rirMax).toBeGreaterThanOrEqual(c.rirMin);
    expect(s.adjustments[0]).toMatch(/Yellow/);
  });

  test("red: about half the sets (4 → 2, 3 → 2), everything else unchanged", () => {
    const three = prescribe(getExercise("back-squat"), "muscle", 3);
    const [four, threeAfter] = applyReadiness([squat, three], "red");
    expect(four.sets).toBe(2);
    expect(threeAfter.sets).toBe(2);
    expect(four.rirMin).toBe(squat.rirMin);
    expect(four.adjustments[0]).toMatch(/Red/);
  });
});
