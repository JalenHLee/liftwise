import { describe, expect, test, vi } from "vitest";
import { defaultForm } from "@/lib/checkin/logic";
import { formToRow } from "@/lib/checkin/save";
import type { AiClient } from "./ai";
import { generateProgram, recommendedProgram, type ProgramRow } from "@/lib/program/program";
import type { Program } from "@/lib/program/types";
import { buildSessionForUser, checkinChangedSince, MAX_BUILDS_PER_DAY, type BuildContext, type SessionRow, type SessionStore } from "./save";

const NOW = new Date("2026-10-09T09:00:00Z");
const DATE = "2026-10-09";

const context = (patch: Partial<BuildContext> = {}): BuildContext => ({
  profile: { goal: "muscle", experience: "intermediate", equipment: "full_gym", days_per_week: 4 },
  checkin: { ...formToRow(DATE, { ...defaultForm(60), sleepHours: 8 }), id: "checkin-1", updated_at: "2026-10-09T08:00:00Z" },
  startingWeights: [{ exercise_id: "barbell-bench-press", weight_kg: 80, reps: null }],
  program: null,
  sessions: [],
  recentCheckins: [],
  setLogs: [],
  ...patch,
});

function storeWith(ctx: BuildContext) {
  const saved: SessionRow[] = [];
  const programs: ProgramRow[] = [];
  const store: SessionStore = {
    loadContext: async () => ctx,
    saveSession: async (row) => {
      saved.push(row);
      return { error: null };
    },
    saveProgram: async (_userId, row) => {
      programs.push(row);
      return { error: null };
    },
  };
  return { store, saved, programs };
}

const BUILT = "2026-10-01T08:00:00Z";
const session = (session_date: string, day_index: number, patch: Partial<BuildContext["sessions"][number]> = {}) => ({
  session_date,
  day_index,
  is_deload: false,
  build_count: 1,
  updated_at: BUILT,
  ...patch,
});
const programRow = (program: Program, rotation_reset_at: string | null = null): ProgramRow => ({ ...program, rotation_reset_at });

describe("building and saving today's session", () => {
  test("saves one row with the plan, readiness snapshot, check-in link and source", async () => {
    const { store, saved } = storeWith(context());
    const result = await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW);
    expect(result).toEqual({ built: { date: DATE, source: "rules", buildsLeft: 3 } });
    const row = saved[0];
    expect(row).toMatchObject({
      user_id: "user-1",
      session_date: DATE,
      checkin_id: "checkin-1",
      checkin_updated_at: "2026-10-09T08:00:00Z",
      template: "upper_lower",
      day_index: 0,
      day_name: "Upper",
      readiness_level: "green",
      source: "rules",
      model: null,
      prompt_version: null,
      build_count: 1,
    });
    expect(row.validation.fallbackReason).toBe("no_api_key");
    // A pre-5a starting weight (no reps) is read as 5 reps: 80 × 5 -> 65 kg for 10 reps at RIR 2.
    expect(row.plan.exercises.find((e) => e.exerciseId === "barbell-bench-press")!.load).toEqual({ kind: "weight", kg: 65 });
  });

  test("rotates to the day after the last session", async () => {
    const { store, saved } = storeWith(context({ sessions: [session("2026-10-07", 0)] }));
    await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW);
    expect(saved[0]).toMatchObject({ day_index: 1, day_name: "Lower" });
  });

  test("a rebuild keeps today's day and counts towards the limit", async () => {
    const { store, saved } = storeWith(
      context({
        sessions: [
          session("2026-10-07", 0),
          session(DATE, 1, { build_count: 2 }),
        ],
      }),
    );
    const result = await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW);
    expect(saved[0]).toMatchObject({ day_index: 1, build_count: 3 });
    expect(result).toEqual({ built: { date: DATE, source: "rules", buildsLeft: 1 } });
  });

  test("refuses a 4th rebuild and doesn't call Claude", async () => {
    const ai = vi.fn<AiClient>();
    const { store, saved } = storeWith(context({ sessions: [session(DATE, 0, { build_count: MAX_BUILDS_PER_DAY })] }));
    const result = await buildSessionForUser(store, "user-1", { date: DATE }, ai, NOW);
    expect(result).toEqual({ error: expect.stringMatching(/daily limit/) });
    expect(ai).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });

  test("needs today's check-in", async () => {
    const { store } = storeWith(context({ checkin: null }));
    expect(await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW)).toEqual({ error: "Save today's check-in first." });
  });

  test("rejects a date no time zone could be on", async () => {
    const { store } = storeWith(context());
    expect(await buildSessionForUser(store, "user-1", { date: "2026-10-20" }, null, NOW)).toHaveProperty("error");
  });

  test("saves Claude's raw reply, model and prompt version", async () => {
    const raw = JSON.stringify({ swaps: [], addedPainAreas: [], addedSoreness: [], explanations: [], daySummary: "Good to go." });
    const { store, saved } = storeWith(context());
    await buildSessionForUser(store, "user-1", { date: DATE }, async () => raw, NOW);
    expect(saved[0]).toMatchObject({ source: "ai", model: "claude-sonnet-5", prompt_version: "session-v2", ai_raw_output: raw });
  });

  test("passes the check-in note to Claude", async () => {
    const ai = vi.fn<AiClient>(async () => "not json");
    const { store, saved } = storeWith(context({ checkin: { ...formToRow(DATE, { ...defaultForm(60), note: "knee is cranky" }), id: "c", updated_at: "2026-10-09T08:00:00Z" } }));
    await buildSessionForUser(store, "user-1", { date: DATE }, ai, NOW);
    expect(JSON.parse(ai.mock.calls[0][0].user).checkIn.note).toBe("knee is cranky");
    expect(saved[0]).toMatchObject({ source: "rules", validation: { fallbackReason: "invalid_json" } });
  });
});

describe("programs as data", () => {
  const setup = { experience: "intermediate" as const, equipment: "full_gym" as const, daysPerWeek: 4 };

  test("a user from before programs were stored gets their recommended template saved, and the same session", async () => {
    const { store, saved, programs } = storeWith(context());
    await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW);
    expect(programs).toEqual([programRow(recommendedProgram(setup))]);
    expect(programs[0]).toMatchObject({ name: "Upper / Lower", source: "template", split: "upper_lower", rotation_reset_at: null });
    // Same day as before 5c: the rotation carries on from the sessions they already have.
    expect(saved[0].plan.exercises.map((e) => e.exerciseId)).toEqual(recommendedProgram(setup).days[0].exercises.map((e) => e.exerciseId));
  });

  test("an existing user keeps their place in the rotation when their program is first stored", async () => {
    const { store, saved } = storeWith(context({ sessions: [session("2026-10-07", 2)] }));
    await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW);
    expect(saved[0]).toMatchObject({ day_index: 3, day_name: "Lower" });
  });

  test("builds from the stored program, not the template, and doesn't save it again", async () => {
    const ppl = generateProgram("push_pull_legs", setup);
    const { store, saved, programs } = storeWith(context({ program: programRow(ppl), sessions: [session("2026-10-07", 1)] }));
    await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW);
    expect(programs).toHaveLength(0);
    expect(saved[0]).toMatchObject({ template: "push_pull_legs", day_index: 2, day_name: "Legs" });
    expect(saved[0].plan.dayCount).toBe(6);
  });

  test("an unreadable stored program falls back to the recommended template and is re-saved", async () => {
    const broken = { ...programRow(recommendedProgram(setup)), days: [{ name: "Upper", exercises: [{ exerciseId: "no-such-lift", sets: 3 }] }] };
    const { store, saved, programs } = storeWith(context({ program: broken }));
    await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW);
    expect(programs).toHaveLength(1);
    expect(saved[0]).toMatchObject({ template: "upper_lower", day_name: "Upper" });
  });
});

describe("picking today's day", () => {
  test("builds the picked day instead of the next in the rotation", async () => {
    const { store, saved } = storeWith(context({ sessions: [session("2026-10-07", 0)] }));
    await buildSessionForUser(store, "user-1", { date: DATE, dayIndex: 3 }, null, NOW);
    expect(saved[0]).toMatchObject({ day_index: 3, day_name: "Lower", build_count: 1 });
  });

  test("the rotation continues from the day actually built", async () => {
    const { store, saved } = storeWith(context({ sessions: [session("2026-10-07", 0), session("2026-10-08", 2)] }));
    await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW);
    expect(saved[0]).toMatchObject({ day_index: 3 });
  });

  test("changing the day after building is a rebuild and counts towards the limit", async () => {
    const { store, saved } = storeWith(context({ sessions: [session(DATE, 0, { build_count: 2 })] }));
    const result = await buildSessionForUser(store, "user-1", { date: DATE, dayIndex: 1 }, null, NOW);
    expect(saved[0]).toMatchObject({ day_index: 1, day_name: "Lower", build_count: 3 });
    expect(result).toEqual({ built: { date: DATE, source: "rules", buildsLeft: 1 } });
  });

  test("a picked day can't get round the daily limit", async () => {
    const { store, saved } = storeWith(context({ sessions: [session(DATE, 0, { build_count: MAX_BUILDS_PER_DAY })] }));
    expect(await buildSessionForUser(store, "user-1", { date: DATE, dayIndex: 1 }, null, NOW)).toHaveProperty("error");
    expect(saved).toHaveLength(0);
  });

  test("rejects a day that isn't in the program", async () => {
    for (const dayIndex of [-1, 4, 1.5]) {
      const { store, saved } = storeWith(context());
      expect(await buildSessionForUser(store, "user-1", { date: DATE, dayIndex }, null, NOW)).toEqual({ error: expect.stringMatching(/isn't in your program/) });
      expect(saved).toHaveLength(0);
    }
  });

  test("after the program is replaced, the rotation restarts at day 1", async () => {
    const program = programRow(recommendedProgram({ experience: "intermediate", equipment: "full_gym", daysPerWeek: 4 }), "2026-10-08T12:00:00Z");
    const { store, saved } = storeWith(context({ program, sessions: [session("2026-10-07", 0), session("2026-10-08", 1)] }));
    await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW);
    expect(saved[0]).toMatchObject({ day_index: 0 });
  });

  test("a session built after the program change counts again", async () => {
    const program = programRow(recommendedProgram({ experience: "intermediate", equipment: "full_gym", daysPerWeek: 4 }), "2026-10-08T12:00:00Z");
    const sessions = [session("2026-10-07", 2), session("2026-10-08", 0, { updated_at: "2026-10-08T13:00:00Z" })];
    const { store, saved } = storeWith(context({ program, sessions }));
    await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW);
    expect(saved[0]).toMatchObject({ day_index: 1 });
  });
});

describe("check-in changed notice", () => {
  test("shows only when the check-in was saved after the session was built", () => {
    expect(checkinChangedSince("2026-10-09T08:00:00Z", "2026-10-09T08:00:00Z")).toBe(false);
    expect(checkinChangedSince("2026-10-09T08:00:00Z", "2026-10-09T08:05:00Z")).toBe(true);
    expect(checkinChangedSince("2026-10-09T08:00:00+00:00", "2026-10-09T08:00:00.000Z")).toBe(false);
  });
});

describe("slice 6: logged sets drive the build", () => {
  const setLog = (exerciseId: string, sessionDate: string, setNumber: number, weightKg: number, reps: number, isDeload = false) => ({
    exerciseId,
    sessionDate,
    isDeload,
    setNumber,
    weightKg,
    reps,
    rir: 2,
    loggedAt: `${sessionDate}T10:00:00Z`,
  });
  const fourSets = (id: string, date: string, kg: number, reps: number) => [1, 2, 3, 4].map((n) => setLog(id, date, n, kg, reps));

  test("once a set is logged today, the session can't be rebuilt (or switched to another day)", async () => {
    const { store, saved } = storeWith(context({ sessions: [session(DATE, 0)], setLogs: [setLog("barbell-bench-press", DATE, 1, 60, 8)] }));
    expect(await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW)).toEqual({ error: "You've started logging today's session, so it stays as it is." });
    expect(await buildSessionForUser(store, "user-1", { date: DATE, dayIndex: 1 }, null, NOW)).toHaveProperty("error");
    expect(saved).toHaveLength(0);
  });

  test("progression uses logged sets from a session that was never marked finished", async () => {
    // The store hands over every logged set, finished or not; nothing filters on completed_at.
    const { store, saved } = storeWith(context({ sessions: [session("2026-10-05", 3)], setLogs: fourSets("barbell-bench-press", "2026-10-05", 60, 10) }));
    await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW);
    const bench = saved[0].plan.exercises.find((e) => e.exerciseId === "barbell-bench-press")!;
    // History beats the onboarding starting weight (80 × 5 -> 65 kg).
    expect(bench.load).toEqual({ kind: "weight", kg: 62.5 });
    expect(bench.tags).toContain("+2.5 KG");
  });

  test("a yellow day holds the increase that history made due", async () => {
    const checkin = { ...formToRow(DATE, { ...defaultForm(60), sleepHours: 5.5 }), id: "checkin-1", updated_at: "2026-10-09T08:00:00Z" };
    const { store, saved } = storeWith(context({ checkin, sessions: [session("2026-10-05", 3)], setLogs: fourSets("barbell-bench-press", "2026-10-05", 60, 10) }));
    await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW);
    const bench = saved[0].plan.exercises.find((e) => e.exerciseId === "barbell-bench-press")!;
    expect(bench.load).toEqual({ kind: "weight", kg: 60 });
    expect(bench.tags).toContain("HELD · WAS DUE +2.5 KG");
  });

  test("two key lifts stalled for 2 weeks (finished sessions or not) -> deload week", async () => {
    // Weeks of 2026-09-14, 09-21, 09-28: squat and bench never beat week 1.
    const stalled = (id: string) => [
      ...fourSets(id, "2026-09-15", 100, 6),
      ...fourSets(id, "2026-09-22", 100, 6),
      ...fourSets(id, "2026-09-29", 100, 5),
    ];
    const { store, saved } = storeWith(
      context({
        sessions: [session("2026-09-15", 0), session("2026-09-22", 1), session("2026-09-29", 2)],
        setLogs: [...stalled("back-squat"), ...stalled("barbell-bench-press")],
      }),
    );
    await buildSessionForUser(store, "user-1", { date: DATE }, null, NOW);
    expect(saved[0].is_deload).toBe(true);
    expect(saved[0].plan.deload.reasons).toContain("2 or more key lifts have stalled for 2 weeks");
  });
});
