import { describe, expect, test } from "vitest";
import { deloadToday, pickDayIndex } from "./schedule";

describe("template day rotation", () => {
  test("the first ever session is day 1", () => {
    expect(pickDayIndex({ dayCount: 4 })).toBe(0);
  });

  test("moves to the day after the last session, whatever the weekday", () => {
    expect(pickDayIndex({ dayCount: 4, lastDayIndexBeforeToday: 0 })).toBe(1);
    expect(pickDayIndex({ dayCount: 4, lastDayIndexBeforeToday: 2 })).toBe(3);
  });

  test("wraps round after the last day", () => {
    expect(pickDayIndex({ dayCount: 4, lastDayIndexBeforeToday: 3 })).toBe(0);
    expect(pickDayIndex({ dayCount: 5, lastDayIndexBeforeToday: 4 })).toBe(0);
  });

  test("rebuilding today keeps today's day", () => {
    expect(pickDayIndex({ dayCount: 4, todaysDayIndex: 2, lastDayIndexBeforeToday: 1 })).toBe(2);
  });

  test("still lands on a real day after switching to fewer days per week", () => {
    expect(pickDayIndex({ dayCount: 3, lastDayIndexBeforeToday: 4 })).toBe(2);
    expect(pickDayIndex({ dayCount: 2, todaysDayIndex: 3 })).toBe(1);
  });
});

describe("deload schedule", () => {
  const none = { sessionDates: [], deloadDates: [], checkIns: [] };

  test("no deload in the first five weeks", () => {
    expect(deloadToday({ ...none, today: "2026-10-01" }).deload).toBe(false);
    expect(deloadToday({ ...none, today: "2026-02-04", sessionDates: ["2026-01-01"] }).deload).toBe(false); // day 34, week 5
  });

  test("the 6th week since the first session is a deload", () => {
    const result = deloadToday({ ...none, today: "2026-02-05", sessionDates: ["2026-01-01", "2026-01-20"] }); // day 35
    expect(result).toEqual({ deload: true, reasons: ["Scheduled deload every 6th week"] });
  });

  test("a deload lasts a week from its first day", () => {
    const h = { ...none, sessionDates: ["2026-01-01"], deloadDates: ["2026-02-05", "2026-02-07"] };
    expect(deloadToday({ ...h, today: "2026-02-11" }).deload).toBe(true);
    expect(deloadToday({ ...h, today: "2026-02-12" }).deload).toBe(false);
  });

  test("the count restarts after a deload, early or scheduled", () => {
    const h = { ...none, sessionDates: ["2026-01-01"], deloadDates: ["2026-01-10"] };
    expect(deloadToday({ ...h, today: "2026-02-20" }).deload).toBe(false); // 41 days after: week 5
    expect(deloadToday({ ...h, today: "2026-02-21" }).deload).toBe(true); // 42 days after: week 6
  });

  test("3 red days in the last 7 triggers a deload", () => {
    const checkIns = ["2026-10-03", "2026-10-05", "2026-10-09"].map((date) => ({ date, level: "red" as const }));
    const result = deloadToday({ ...none, today: "2026-10-09", checkIns });
    expect(result.deload).toBe(true);
    expect(result.reasons).toContain("3 or more red days in the last 7 days");
  });
});
