import type { createClient } from "@/lib/supabase/server";
import { PROGRAM_COLUMNS, saveProgramRow } from "@/lib/program/supabase";
import type { SetLog } from "@/lib/engine/history";
import { dayNumber } from "./schedule";
import type { BuildContext, SessionStore } from "./save";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const isoDaysBefore = (date: string, days: number) => new Date((dayNumber(date) - days) * 86_400_000).toISOString().slice(0, 10);

/** Enough recent sets for progression (last 2 sessions per lift) and the stall check (a few weeks). */
const SET_LOG_LIMIT = 1000;

type SetLogRow = {
  exercise_id: string;
  set_number: number;
  weight_kg: number | string | null;
  reps: number;
  rir: number;
  logged_at: string;
  sessions: { session_date: string; is_deload: boolean } | { session_date: string; is_deload: boolean }[] | null;
};

export function toSetLog(row: SetLogRow): SetLog | null {
  const session = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
  if (!session) return null;
  return {
    exerciseId: row.exercise_id,
    sessionDate: session.session_date,
    isDeload: session.is_deload,
    setNumber: row.set_number,
    weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
    reps: row.reps,
    rir: row.rir,
    loggedAt: row.logged_at,
  };
}

const CHECKIN_COLUMNS =
  "id, updated_at, checkin_date, sleep_hours, energy, soreness, pain_areas, minutes_available, note, readiness_level, readiness_reasons";

/** The session builder's database calls, against Supabase (Row Level Security limits every query to the user). */
export function supabaseSessionStore(supabase: Supabase): SessionStore {
  return {
    async loadContext(userId, date) {
      const [profile, checkin, weights, sessions, recent, program, logs] = await Promise.all([
        supabase.from("profiles").select("goal, experience, equipment, days_per_week").eq("user_id", userId).maybeSingle(),
        supabase.from("checkins").select(CHECKIN_COLUMNS).eq("user_id", userId).eq("checkin_date", date).maybeSingle(),
        supabase.from("starting_weights").select("exercise_id, weight_kg, reps").eq("user_id", userId),
        supabase.from("sessions").select("session_date, day_index, is_deload, build_count, updated_at").eq("user_id", userId).lte("session_date", date),
        supabase.from("checkins").select("checkin_date, readiness_level").eq("user_id", userId).gte("checkin_date", isoDaysBefore(date, 6)).lte("checkin_date", date),
        supabase.from("programs").select(PROGRAM_COLUMNS).eq("user_id", userId).maybeSingle(),
        supabase
          .from("set_logs")
          .select("exercise_id, set_number, weight_kg, reps, rir, logged_at, sessions!inner(session_date, is_deload)")
          .eq("user_id", userId)
          .lte("sessions.session_date", date)
          .order("logged_at", { ascending: false })
          .limit(SET_LOG_LIMIT),
      ]);
      return {
        profile: profile.data,
        checkin: checkin.data,
        startingWeights: weights.data ?? [],
        sessions: sessions.data ?? [],
        recentCheckins: recent.data ?? [],
        program: program.data,
        setLogs: ((logs.data ?? []) as SetLogRow[]).flatMap((r) => toSetLog(r) ?? []),
      } as BuildContext;
    },
    async saveSession(row) {
      const { error } = await supabase.from("sessions").upsert(row, { onConflict: "user_id,session_date" });
      return { error: error?.message ?? null };
    },
    saveProgram: (userId, row) => saveProgramRow(supabase, userId, row),
  };
}
