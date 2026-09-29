import { describe, expect, test, vi } from "vitest";
import { defaultForm, type CheckinForm } from "./logic";
import { CHECKIN_CONFLICT_COLUMNS, formToRow, rowToSaved, saveCheckinForUser, type CheckinStore } from "./save";

const NOW = new Date("2026-09-29T12:00:00Z");
const form = (overrides: Partial<CheckinForm> = {}): CheckinForm => ({ ...defaultForm(60), ...overrides });

function fakeStore(error: { message: string } | null = null) {
  const upsert = vi.fn().mockResolvedValue({ error });
  const from = vi.fn().mockReturnValue({ upsert });
  return { store: { from } as unknown as CheckinStore, from, upsert };
}

describe("saving a check-in", () => {
  test("upserts one row per user per local day", async () => {
    const { store, from, upsert } = fakeStore();
    const result = await saveCheckinForUser(store, "user-1", { date: "2026-09-29", form: form() }, NOW);

    expect(result).toHaveProperty("saved");
    expect(from).toHaveBeenCalledWith("checkins");
    expect(CHECKIN_CONFLICT_COLUMNS).toBe("user_id,checkin_date");
    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, options] = upsert.mock.calls[0];
    expect(options).toEqual({ onConflict: "user_id,checkin_date" });
    expect(row).toMatchObject({ user_id: "user-1", checkin_date: "2026-09-29", sleep_hours: 7, energy: 3, minutes_available: 60 });
  });

  test("saves the readiness snapshot computed by the engine", async () => {
    const { store, upsert } = fakeStore();
    await saveCheckinForUser(store, "u", { date: "2026-09-29", form: form({ sleepHours: 5.5, soreness: { quads: 3 } }) }, NOW);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      readiness_level: "yellow",
      readiness_reasons: ["5.5h sleep", "sore quads"],
    });
  });

  test("editing the same day recomputes the snapshot and sends the same conflict key", async () => {
    const { store, upsert } = fakeStore();
    await saveCheckinForUser(store, "u", { date: "2026-09-29", form: form({ sleepHours: 5.5 }) }, NOW);
    await saveCheckinForUser(store, "u", { date: "2026-09-29", form: form({ sleepHours: 8 }) }, NOW);

    const [first, second] = upsert.mock.calls.map((c) => c[0]);
    expect(first.readiness_level).toBe("yellow");
    expect(second.readiness_level).toBe("green");
    expect(second.readiness_reasons).toEqual([]);
    expect([first.checkin_date, first.user_id]).toEqual([second.checkin_date, second.user_id]);
    expect(upsert.mock.calls.every((c) => c[1].onConflict === "user_id,checkin_date")).toBe(true);
  });

  test("leaves 'none' muscles out, clears pain when the answer is No, and trims the note", () => {
    const row = formToRow("2026-09-29", form({ soreness: { quads: 3, chest: 0 }, hasPain: false, painAreas: ["knee"], note: "  tight hip  " }));
    expect(row.soreness).toEqual({ quads: 3 });
    expect(row.pain_areas).toEqual([]);
    expect(row.note).toBe("tight hip");
    expect(formToRow("2026-09-29", form({ note: "   " })).note).toBeNull();
  });

  test("refuses invalid answers and dates without touching the database", async () => {
    const { store, upsert } = fakeStore();
    expect(await saveCheckinForUser(store, "u", { date: "2026-09-29", form: form({ energy: 9 }) }, NOW)).toHaveProperty("error");
    expect(await saveCheckinForUser(store, "u", { date: "2025-01-01", form: form() }, NOW)).toHaveProperty("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  test("passes a database error back to the screen", async () => {
    const { store } = fakeStore({ message: "boom" });
    expect(await saveCheckinForUser(store, "u", { date: "2026-09-29", form: form() }, NOW)).toEqual({ error: "boom" });
  });
});

describe("reading a saved row back", () => {
  test("round-trips the answers and keeps the snapshot as saved", () => {
    const original = form({ sleepHours: 5.5, soreness: { quads: 3, back: 5 }, hasPain: true, painAreas: ["hip", "knee"], note: "ok" });
    const saved = rowToSaved(formToRow("2026-09-29", original));
    expect(saved?.form).toEqual(original);
    expect(saved?.readiness.level).toBe("yellow");
  });

  test("shows the snapshot from that day, even if today's rules would say something else", () => {
    const row = { ...formToRow("2026-09-29", form()), readiness_level: "red", readiness_reasons: ["old rule"] };
    expect(rowToSaved(row)?.readiness).toEqual({ level: "red", tags: ["old rule"] });
  });

  test("ignores a row with an unknown readiness level", () => {
    expect(rowToSaved({ ...formToRow("2026-09-29", form()), readiness_level: "purple" })).toBeNull();
  });
});
