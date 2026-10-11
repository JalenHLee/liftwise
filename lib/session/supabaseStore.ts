import type { createClient } from "@/lib/supabase/server";
import { PROGRAM_COLUMNS, saveProgramRow } from "@/lib/program/supabase";
import { dayNumber } from "./schedule";
import type { BuildContext, SessionStore } from "./save";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const isoDaysBefore = (date: string, days: number) => new Date((dayNumber(date) - days) * 86_400_000).toISOString().slice(0, 10);

const CHECKIN_COLUMNS =
  "id, updated_at, checkin_date, sleep_hours, energy, soreness, pain_areas, minutes_available, note, readiness_level, readiness_reasons";

/** The session builder's database calls, against Supabase (Row Level Security limits every query to the user). */
export function supabaseSessionStore(supabase: Supabase): SessionStore {
  return {
    async loadContext(userId, date) {
      const [profile, checkin, weights, sessions, recent, program] = await Promise.all([
        supabase.from("profiles").select("goal, experience, equipment, days_per_week").eq("user_id", userId).maybeSingle(),
        supabase.from("checkins").select(CHECKIN_COLUMNS).eq("user_id", userId).eq("checkin_date", date).maybeSingle(),
        supabase.from("starting_weights").select("exercise_id, weight_kg, reps").eq("user_id", userId),
        supabase.from("sessions").select("session_date, day_index, is_deload, build_count, updated_at").eq("user_id", userId).lte("session_date", date),
        supabase.from("checkins").select("checkin_date, readiness_level").eq("user_id", userId).gte("checkin_date", isoDaysBefore(date, 6)).lte("checkin_date", date),
        supabase.from("programs").select(PROGRAM_COLUMNS).eq("user_id", userId).maybeSingle(),
      ]);
      return {
        profile: profile.data,
        checkin: checkin.data,
        startingWeights: weights.data ?? [],
        sessions: sessions.data ?? [],
        recentCheckins: recent.data ?? [],
        program: program.data,
      } as BuildContext;
    },
    async saveSession(row) {
      const { error } = await supabase.from("sessions").upsert(row, { onConflict: "user_id,session_date" });
      return { error: error?.message ?? null };
    },
    saveProgram: (userId, row) => saveProgramRow(supabase, userId, row),
  };
}
