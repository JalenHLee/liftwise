import {
  hasErrors,
  isPlausibleLocalDate,
  isReadinessLevel,
  snapshotReadiness,
  validateCheckin,
  type CheckinForm,
  type SavedCheckin,
  type SorenessLevel,
} from "./logic";
import { MUSCLES, PAIN_AREAS } from "@/lib/engine/types";

/** One row of the `checkins` table (see supabase/migrations/0002_checkins.sql). */
export type CheckinRow = {
  checkin_date: string;
  sleep_hours: number;
  energy: number;
  /** Muscle -> 2..5. Muscles at "none" are left out. */
  soreness: Record<string, number>;
  pain_areas: string[];
  minutes_available: number;
  note: string | null;
  readiness_level: string;
  readiness_reasons: string[];
};

/** The one Supabase call the save needs, so tests can stand in for the database. */
export type CheckinStore = {
  from(table: "checkins"): {
    upsert(
      row: CheckinRow & { user_id: string; updated_at: string },
      options: { onConflict: string },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
};

export const CHECKIN_CONFLICT_COLUMNS = "user_id,checkin_date";

export function formToRow(date: string, form: CheckinForm): CheckinRow {
  const readiness = snapshotReadiness(form);
  const soreness: Record<string, number> = {};
  for (const m of MUSCLES) {
    const level = form.soreness[m] ?? 0;
    if (level > 0) soreness[m] = level;
  }
  return {
    checkin_date: date,
    sleep_hours: form.sleepHours,
    energy: form.energy,
    soreness,
    pain_areas: form.hasPain ? form.painAreas : [],
    minutes_available: form.minutesAvailable,
    note: form.note.trim() === "" ? null : form.note.trim(),
    readiness_level: readiness.level,
    readiness_reasons: readiness.tags,
  };
}

/** Reads a saved row back into the shape the screen uses. Returns null for anything unexpected. */
export function rowToSaved(row: CheckinRow): SavedCheckin | null {
  if (!isReadinessLevel(row.readiness_level)) return null;
  const soreness: CheckinForm["soreness"] = {};
  for (const m of MUSCLES) {
    const level = row.soreness?.[m] ?? 0;
    if (level >= 2 && level <= 5) soreness[m] = level as SorenessLevel;
  }
  const painAreas = PAIN_AREAS.filter((a) => row.pain_areas?.includes(a));
  return {
    date: row.checkin_date,
    form: {
      sleepHours: Number(row.sleep_hours),
      energy: row.energy,
      soreness,
      hasPain: painAreas.length > 0,
      painAreas,
      minutesAvailable: row.minutes_available,
      note: row.note ?? "",
    },
    readiness: { level: row.readiness_level, tags: row.readiness_reasons ?? [] },
  };
}

export type SaveResult = { saved: SavedCheckin } | { error: string };

/**
 * Validates, re-scores readiness with the engine (never trusting the client's score) and
 * upserts one row per user per local date. Saving again the same day overwrites that row,
 * including the readiness snapshot.
 */
export async function saveCheckinForUser(
  store: CheckinStore,
  userId: string,
  input: { date: string; form: CheckinForm },
  now: Date = new Date(),
): Promise<SaveResult> {
  if (!isPlausibleLocalDate(input.date, now)) return { error: "That date doesn't look right. Please refresh and try again." };
  const errors = validateCheckin(input.form);
  if (hasErrors(errors)) return { error: Object.values(errors)[0] as string };

  const row = formToRow(input.date, input.form);
  const { error } = await store
    .from("checkins")
    .upsert({ ...row, user_id: userId, updated_at: now.toISOString() }, { onConflict: CHECKIN_CONFLICT_COLUMNS });
  if (error) return { error: error.message };

  const saved = rowToSaved(row);
  return saved ? { saved } : { error: "Something went wrong saving your check-in." };
}
