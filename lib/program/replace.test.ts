import { describe, expect, test } from "vitest";
import { generateProgram, type ProgramRow } from "./program";
import { replaceProgramForUser, type ReplaceStore } from "./replace";

const NOW = new Date("2026-10-09T09:00:00Z");

function storeWith(profile: { experience: string; equipment: string } | null = { experience: "beginner", equipment: "unit_gym" }) {
  const days: number[] = [];
  const programs: ProgramRow[] = [];
  const store: ReplaceStore = {
    loadProfile: async () => profile,
    saveDaysPerWeek: async (_u, d) => (days.push(d), { error: null }),
    saveProgram: async (_u, row) => (programs.push(row), { error: null }),
  };
  return { store, days, programs };
}

describe("replacing the program", () => {
  test("regenerates for the new days and split, and restarts the rotation", async () => {
    const { store, days, programs } = storeWith();
    expect(await replaceProgramForUser(store, "u", { daysPerWeek: 4, split: "push_pull_legs" }, NOW)).toEqual({ ok: true });
    expect(days).toEqual([4]);
    const expected = generateProgram("push_pull_legs", { daysPerWeek: 4, experience: "beginner", equipment: "unit_gym" });
    expect(programs).toEqual([{ ...expected, rotation_reset_at: NOW.toISOString() }]);
  });

  test("refuses a split that isn't offered for those days, and saves nothing", async () => {
    const { store, days, programs } = storeWith();
    expect(await replaceProgramForUser(store, "u", { daysPerWeek: 2, split: "push_pull_legs" }, NOW)).toHaveProperty("error");
    expect(await replaceProgramForUser(store, "u", { daysPerWeek: 7, split: "upper_lower" }, NOW)).toHaveProperty("error");
    expect(days).toEqual([]);
    expect(programs).toEqual([]);
  });

  test("needs a finished profile", async () => {
    const { store } = storeWith(null);
    expect(await replaceProgramForUser(store, "u", { daysPerWeek: 4, split: "upper_lower" }, NOW)).toEqual({ error: "Finish onboarding first." });
  });
});
