import { afterEach, describe, expect, test } from "vitest";
import {
  defaultForm,
  formatDateLabel,
  formatSleep,
  isPlausibleLocalDate,
  localDateString,
  lookbackDate,
  nextSoreness,
  readinessDisplay,
  snapshotReadiness,
  stepSleep,
  togglePainArea,
  toEngineCheckIn,
  validateCheckin,
  type CheckinForm,
} from "./logic";

const form = (overrides: Partial<CheckinForm> = {}): CheckinForm => ({ ...defaultForm(60), ...overrides });

describe("local date", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  test("uses the user's clock, not UTC: evening in Los Angeles is still the same day", () => {
    process.env.TZ = "America/Los_Angeles";
    // 03:00 UTC on 30 Sep is 20:00 on 29 Sep in Los Angeles.
    expect(localDateString(new Date("2026-09-30T03:00:00Z"))).toBe("2026-09-29");
  });

  test("uses the user's clock, not UTC: morning in Auckland is already the next day", () => {
    process.env.TZ = "Pacific/Auckland";
    expect(localDateString(new Date("2026-09-29T20:00:00Z"))).toBe("2026-09-30");
  });

  test("pads month and day", () => {
    process.env.TZ = "UTC";
    expect(localDateString(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
  });

  test("the server accepts the UTC date and one day either side, nothing else", () => {
    const now = new Date("2026-09-29T12:00:00Z");
    expect(isPlausibleLocalDate("2026-09-29", now)).toBe(true);
    expect(isPlausibleLocalDate("2026-09-28", now)).toBe(true);
    expect(isPlausibleLocalDate("2026-09-30", now)).toBe(true);
    expect(isPlausibleLocalDate("2026-09-27", now)).toBe(false);
    expect(isPlausibleLocalDate("2026-10-01", now)).toBe(false);
  });

  test("rejects things that aren't real dates", () => {
    const now = new Date("2026-09-29T12:00:00Z");
    expect(isPlausibleLocalDate("2026-02-30", now)).toBe(false);
    expect(isPlausibleLocalDate("29/09/2026", now)).toBe(false);
    expect(isPlausibleLocalDate("", now)).toBe(false);
  });

  test("looks back two days from the UTC date, across month ends", () => {
    expect(lookbackDate(new Date("2026-09-29T12:00:00Z"))).toBe("2026-09-27");
    expect(lookbackDate(new Date("2026-03-01T00:30:00Z"))).toBe("2026-02-27");
  });

  test("formats the header label without time-zone surprises", () => {
    expect(formatDateLabel("2026-09-29")).toBe("Tue 29 Sep");
    expect(formatDateLabel("2026-01-01")).toBe("Thu 1 Jan");
  });
});

describe("soreness cycling", () => {
  test("0 → 2 → 3 → 4 → 5 → 0", () => {
    const seen = [0 as const];
    for (let i = 0; i < 5; i++) seen.push(nextSoreness(seen[i]) as never);
    expect(seen).toEqual([0, 2, 3, 4, 5, 0]);
  });

  test("a muscle that hasn't been touched starts the cycle at 2", () => {
    expect(nextSoreness(undefined)).toBe(2);
  });
});

describe("sleep and pain inputs", () => {
  test("sleep moves in half-hour steps", () => {
    expect(stepSleep(7, 1)).toBe(7.5);
    expect(stepSleep(7, -1)).toBe(6.5);
  });

  test("sleep stays between 0 and 14", () => {
    expect(stepSleep(0, -1)).toBe(0);
    expect(stepSleep(14, 1)).toBe(14);
  });

  test("sleep shows one decimal", () => {
    expect(formatSleep(7)).toBe("7.0");
    expect(formatSleep(5.5)).toBe("5.5");
  });

  test("pain areas toggle on and off", () => {
    expect(togglePainArea([], "knee")).toEqual(["knee"]);
    expect(togglePainArea(["knee"], "hip")).toEqual(["hip", "knee"]);
    expect(togglePainArea(["knee", "hip"], "knee")).toEqual(["hip"]);
  });
});

describe("engine hand-off", () => {
  test("muscles left at 0 are missing, so the engine reads them as 'none'", () => {
    const engine = toEngineCheckIn(form({ soreness: { quads: 3, chest: 0 } }));
    expect(engine.soreness).toEqual({ quads: 3 });
  });

  test("pain areas only count when the answer is Yes", () => {
    expect(toEngineCheckIn(form({ hasPain: false, painAreas: ["knee"] })).painAreas).toEqual([]);
    expect(toEngineCheckIn(form({ hasPain: true, painAreas: ["knee"] })).painAreas).toEqual(["knee"]);
  });
});

describe("readiness display", () => {
  test("default answers are a green day with no flags", () => {
    const d = readinessDisplay(snapshotReadiness(form()));
    expect(d).toMatchObject({ level: "green", label: "Green day", tags: [] });
  });

  test("5.5 h of sleep and sore quads is a yellow day with those two reasons", () => {
    const d = readinessDisplay(snapshotReadiness(form({ sleepHours: 5.5, soreness: { quads: 3 } })));
    expect(d.level).toBe("yellow");
    expect(d.label).toBe("Yellow day");
    expect(d.tags).toEqual(["5.5h sleep", "sore quads"]);
    expect(d.tags.join(" · ").toUpperCase()).toBe("5.5H SLEEP · SORE QUADS");
  });

  test("under 5 h and low energy is a red day", () => {
    expect(snapshotReadiness(form({ sleepHours: 4.5, energy: 2 })).level).toBe("red");
  });

  test("three very sore muscles make a red day", () => {
    expect(snapshotReadiness(form({ soreness: { quads: 4, back: 5, chest: 4 } })).level).toBe("red");
  });
});

describe("validation", () => {
  test("a normal check-in is valid", () => {
    expect(validateCheckin(form())).toEqual({});
  });

  test("rejects out-of-range or odd values", () => {
    expect(validateCheckin(form({ sleepHours: 7.3 })).sleepHours).toBeDefined();
    expect(validateCheckin(form({ sleepHours: 15 })).sleepHours).toBeDefined();
    expect(validateCheckin(form({ energy: 6 })).energy).toBeDefined();
    expect(validateCheckin(form({ minutesAvailable: 50 })).minutesAvailable).toBeDefined();
    expect(validateCheckin(form({ soreness: { quads: 1 as never } })).soreness).toBeDefined();
    expect(validateCheckin(form({ note: "x".repeat(501) })).note).toBeDefined();
  });

  test("saying Yes to pain needs at least one area", () => {
    expect(validateCheckin(form({ hasPain: true, painAreas: [] })).painAreas).toBeDefined();
    expect(validateCheckin(form({ hasPain: true, painAreas: ["knee"] }))).toEqual({});
  });
});
