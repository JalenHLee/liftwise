import { describe, expect, test } from "vitest";
import { todayDay, type TodaySession } from "./todayDay";

const names = ["Push", "Pull", "Legs"];
const s = (session_date: string, day_index: number, updated_at = "2026-10-01T08:00:00Z"): TodaySession => ({
  session_date,
  day_index,
  updated_at,
  day_name: names[day_index],
  build_count: 1,
});
const base = { today: "2026-10-09", dayNames: names, rotationResetAt: null, picked: null };

describe("today's program day on the Today screen", () => {
  test("next in the rotation before building", () => {
    expect(todayDay({ ...base, sessions: [s("2026-10-08", 0)] })).toMatchObject({ dayIndex: 1, dayName: "Pull", status: "next", nextIndex: 1, built: null });
  });

  test("a picked day", () => {
    expect(todayDay({ ...base, sessions: [s("2026-10-08", 0)], picked: 2 })).toMatchObject({ dayIndex: 2, dayName: "Legs", status: "picked", nextIndex: 1 });
    expect(todayDay({ ...base, sessions: [s("2026-10-08", 0)], picked: 1 }).status).toBe("next");
  });

  test("once built, shows the built day", () => {
    expect(todayDay({ ...base, sessions: [s("2026-10-08", 0), s("2026-10-09", 2)], picked: 0 })).toMatchObject({ dayIndex: 2, dayName: "Legs", status: "built" });
  });

  test("a session built before the program was replaced", () => {
    const result = todayDay({ ...base, sessions: [s("2026-10-09", 2)], rotationResetAt: "2026-10-09T09:00:00Z" });
    expect(result).toMatchObject({ dayIndex: null, dayName: "Legs", status: "built_old_program", nextIndex: 0 });
  });
});
