import { describe, expect, test } from "vitest";
import { supabaseSessionStore, toSetLog } from "./supabaseStore";

/** A stand-in for the Supabase client that records every query and returns `rows` for set_logs. */
function fakeSupabase(rows: unknown[]) {
  const calls: { table: string; chain: string[] }[] = [];
  const builder = (table: string, chain: string[]): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            const data = table === "set_logs" ? rows : table === "sessions" || table === "checkins" || table === "starting_weights" ? [] : null;
            return (resolve: (v: unknown) => void) => resolve({ data, error: null });
          }
          return (...args: unknown[]) => {
            chain.push(`${prop}(${args.map((a) => JSON.stringify(a)).join(", ")})`);
            return builder(table, chain);
          };
        },
      },
    );
  return {
    calls,
    client: {
      from(table: string) {
        const chain: string[] = [];
        calls.push({ table, chain });
        return builder(table, chain);
      },
    },
  };
}

describe("loading logged sets for the build", () => {
  test("reads every logged set up to today, whether or not its session was finished", async () => {
    const rows = [
      { exercise_id: "back-squat", set_number: 1, weight_kg: "100.00", reps: 5, rir: 2, logged_at: "2026-10-05T10:00:00Z", sessions: { session_date: "2026-10-05", is_deload: false } },
    ];
    const fake = fakeSupabase(rows);
    const store = supabaseSessionStore(fake.client as never);
    const ctx = await store.loadContext("user-1", "2026-10-09");
    expect(ctx.setLogs).toEqual([
      { exerciseId: "back-squat", sessionDate: "2026-10-05", isDeload: false, setNumber: 1, weightKg: 100, reps: 5, rir: 2, loggedAt: "2026-10-05T10:00:00Z" },
    ]);
    const query = fake.calls.find((c) => c.table === "set_logs")!.chain.join(" ");
    expect(query).not.toContain("completed_at");
    expect(query).toContain('lte("sessions.session_date", "2026-10-09")');
  });

  test("bodyweight sets keep a null weight; rows without a session are dropped", () => {
    const row = { exercise_id: "push-up", set_number: 1, weight_kg: null, reps: 12, rir: 1, logged_at: "t", sessions: [{ session_date: "2026-10-05", is_deload: true }] };
    expect(toSetLog(row)).toMatchObject({ weightKg: null, isDeload: true });
    expect(toSetLog({ ...row, sessions: null })).toBeNull();
  });
});
