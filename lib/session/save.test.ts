import { describe, expect, test, vi } from "vitest";
import { defaultForm } from "@/lib/checkin/logic";
import { formToRow } from "@/lib/checkin/save";
import type { AiClient } from "./ai";
import { buildSessionForUser, checkinChangedSince, MAX_BUILDS_PER_DAY, type BuildContext, type SessionRow, type SessionStore } from "./save";

const NOW = new Date("2026-10-09T09:00:00Z");
const DATE = "2026-10-09";

const context = (patch: Partial<BuildContext> = {}): BuildContext => ({
  profile: { goal: "muscle", experience: "intermediate", equipment: "full_gym", days_per_week: 4 },
  checkin: { ...formToRow(DATE, { ...defaultForm(60), sleepHours: 8 }), id: "checkin-1", updated_at: "2026-10-09T08:00:00Z" },
  startingWeights: [{ exercise_id: "barbell-bench-press", weight_kg: 80, reps: null }],
  sessions: [],
  recentCheckins: [],
  ...patch,
});

function storeWith(ctx: BuildContext) {
  const saved: SessionRow[] = [];
  const store: SessionStore = {
    loadContext: async () => ctx,
    saveSession: async (row) => {
      saved.push(row);
      return { error: null };
    },
  };
  return { store, saved };
}

describe("building and saving today's session", () => {
  test("saves one row with the plan, readiness snapshot, check-in link and source", async () => {
    const { store, saved } = storeWith(context());
    const result = await buildSessionForUser(store, "user-1", DATE, null, NOW);
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
    const { store, saved } = storeWith(context({ sessions: [{ session_date: "2026-10-07", day_index: 0, is_deload: false, build_count: 1 }] }));
    await buildSessionForUser(store, "user-1", DATE, null, NOW);
    expect(saved[0]).toMatchObject({ day_index: 1, day_name: "Lower" });
  });

  test("a rebuild keeps today's day and counts towards the limit", async () => {
    const { store, saved } = storeWith(
      context({
        sessions: [
          { session_date: "2026-10-07", day_index: 0, is_deload: false, build_count: 1 },
          { session_date: DATE, day_index: 1, is_deload: false, build_count: 2 },
        ],
      }),
    );
    const result = await buildSessionForUser(store, "user-1", DATE, null, NOW);
    expect(saved[0]).toMatchObject({ day_index: 1, build_count: 3 });
    expect(result).toEqual({ built: { date: DATE, source: "rules", buildsLeft: 1 } });
  });

  test("refuses a 4th rebuild and doesn't call Claude", async () => {
    const ai = vi.fn<AiClient>();
    const { store, saved } = storeWith(context({ sessions: [{ session_date: DATE, day_index: 0, is_deload: false, build_count: MAX_BUILDS_PER_DAY }] }));
    const result = await buildSessionForUser(store, "user-1", DATE, ai, NOW);
    expect(result).toEqual({ error: expect.stringMatching(/daily limit/) });
    expect(ai).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });

  test("needs today's check-in", async () => {
    const { store } = storeWith(context({ checkin: null }));
    expect(await buildSessionForUser(store, "user-1", DATE, null, NOW)).toEqual({ error: "Save today's check-in first." });
  });

  test("rejects a date no time zone could be on", async () => {
    const { store } = storeWith(context());
    expect(await buildSessionForUser(store, "user-1", "2026-10-20", null, NOW)).toHaveProperty("error");
  });

  test("saves Claude's raw reply, model and prompt version", async () => {
    const raw = JSON.stringify({ swaps: [], addedPainAreas: [], addedSoreness: [], explanations: [], daySummary: "Good to go." });
    const { store, saved } = storeWith(context());
    await buildSessionForUser(store, "user-1", DATE, async () => raw, NOW);
    expect(saved[0]).toMatchObject({ source: "ai", model: "claude-sonnet-5", prompt_version: "session-v1", ai_raw_output: raw });
  });

  test("passes the check-in note to Claude", async () => {
    const ai = vi.fn<AiClient>(async () => "not json");
    const { store, saved } = storeWith(context({ checkin: { ...formToRow(DATE, { ...defaultForm(60), note: "knee is cranky" }), id: "c", updated_at: "2026-10-09T08:00:00Z" } }));
    await buildSessionForUser(store, "user-1", DATE, ai, NOW);
    expect(JSON.parse(ai.mock.calls[0][0].user).checkIn.note).toBe("knee is cranky");
    expect(saved[0]).toMatchObject({ source: "rules", validation: { fallbackReason: "invalid_json" } });
  });
});

describe("check-in changed notice", () => {
  test("shows only when the check-in was saved after the session was built", () => {
    expect(checkinChangedSince("2026-10-09T08:00:00Z", "2026-10-09T08:00:00Z")).toBe(false);
    expect(checkinChangedSince("2026-10-09T08:00:00Z", "2026-10-09T08:05:00Z")).toBe(true);
    expect(checkinChangedSince("2026-10-09T08:00:00+00:00", "2026-10-09T08:00:00.000Z")).toBe(false);
  });
});
