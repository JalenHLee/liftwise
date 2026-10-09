import { isPlausibleLocalDate, toEngineCheckIn } from "@/lib/checkin/logic";
import { rowToSaved, type CheckinRow } from "@/lib/checkin/save";
import type { RecentSet } from "@/lib/engine/startingLoad";
import { EQUIPMENT_SETUPS, EXPERIENCES, GOALS, type EquipmentSetup, type Experience, type Goal, type Readiness } from "@/lib/engine/types";
import type { AiClient } from "./ai";
import { programDay } from "./draft";
import { generateSession } from "./generate";
import { dayNumber, deloadToday, pickDayIndex } from "./schedule";
import type { SessionPlan, SessionSource, ValidationResult } from "./types";

/** The first build plus 3 rebuilds a day. */
export const MAX_BUILDS_PER_DAY = 4;
/** Starting sets saved before slice 5a have no reps; treat them as 5 (decision 16). */
export const DEFAULT_STARTING_REPS = 5;

export const buildsLeft = (buildCount: number) => Math.max(0, MAX_BUILDS_PER_DAY - buildCount);

export type BuildContext = {
  profile: { goal: string; experience: string; equipment: string; days_per_week: number } | null;
  checkin: (CheckinRow & { id: string; updated_at: string }) | null;
  startingWeights: { exercise_id: string; weight_kg: number; reps: number | null }[];
  /** Every earlier-or-same-day session (small: one row per training day). */
  sessions: { session_date: string; day_index: number; is_deload: boolean; build_count: number }[];
  /** Check-ins from the last 7 days, today included. */
  recentCheckins: { checkin_date: string; readiness_level: string }[];
};

/** One row of the `sessions` table (see supabase/migrations/0004_sessions.sql). */
export type SessionRow = {
  user_id: string;
  session_date: string;
  checkin_id: string;
  checkin_updated_at: string;
  template: string;
  day_index: number;
  day_name: string;
  is_deload: boolean;
  readiness_level: Readiness;
  readiness_reasons: string[];
  plan: SessionPlan;
  source: SessionSource;
  model: string | null;
  prompt_version: string | null;
  ai_raw_output: string | null;
  validation: ValidationResult;
  build_count: number;
  updated_at: string;
};

/** The database calls the build needs, so tests can stand in for Supabase. */
export type SessionStore = {
  loadContext(userId: string, date: string): Promise<BuildContext>;
  saveSession(row: SessionRow): Promise<{ error: string | null }>;
};

export type BuildResult = { built: { date: string; source: SessionSource; buildsLeft: number } } | { error: string };

const oneOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/**
 * Builds (or rebuilds) the user's session for their local `date` and saves it.
 * Needs today's check-in; refuses after the daily rebuild limit.
 */
export async function buildSessionForUser(
  store: SessionStore,
  userId: string,
  date: string,
  ai: AiClient | null,
  now: Date = new Date(),
): Promise<BuildResult> {
  if (!isPlausibleLocalDate(date, now)) return { error: "That date doesn't look right. Please refresh and try again." };
  const ctx = await store.loadContext(userId, date);

  const p = ctx.profile;
  if (!p || !oneOf<Goal>(GOALS, p.goal) || !oneOf<Experience>(EXPERIENCES, p.experience) || !oneOf<EquipmentSetup>(EQUIPMENT_SETUPS, p.equipment)) {
    return { error: "Finish onboarding first." };
  }
  const saved = ctx.checkin && rowToSaved(ctx.checkin);
  if (!ctx.checkin || !saved) return { error: "Save today's check-in first." };

  const todays = ctx.sessions.find((s) => s.session_date === date);
  if (todays && todays.build_count >= MAX_BUILDS_PER_DAY) {
    return { error: "You've rebuilt today's session 3 times, which is the daily limit. It's saved as it is." };
  }

  const profile = { goal: p.goal, experience: p.experience, equipment: p.equipment, daysPerWeek: p.days_per_week };
  const earlier = ctx.sessions.filter((s) => dayNumber(s.session_date) < dayNumber(date)).sort((a, b) => dayNumber(b.session_date) - dayNumber(a.session_date));
  const dayIndex = pickDayIndex({
    dayCount: programDay(profile, 0).dayCount,
    todaysDayIndex: todays?.day_index,
    lastDayIndexBeforeToday: earlier[0]?.day_index,
  });
  const deload = deloadToday({
    today: date,
    sessionDates: earlier.map((s) => s.session_date),
    deloadDates: earlier.filter((s) => s.is_deload).map((s) => s.session_date),
    checkIns: ctx.recentCheckins.flatMap((c) =>
      c.readiness_level === "green" || c.readiness_level === "yellow" || c.readiness_level === "red" ? [{ date: c.checkin_date, level: c.readiness_level }] : [],
    ),
  });
  const startingWeights: Record<string, RecentSet> = Object.fromEntries(
    ctx.startingWeights.map((w) => [w.exercise_id, { weightKg: Number(w.weight_kg), reps: w.reps ?? DEFAULT_STARTING_REPS }]),
  );

  const result = await generateSession(
    { profile, dayIndex, checkIn: toEngineCheckIn(saved.form), note: saved.form.note, startingWeights, deload },
    ai,
  );

  const buildCount = (todays?.build_count ?? 0) + 1;
  const { error } = await store.saveSession({
    user_id: userId,
    session_date: date,
    checkin_id: ctx.checkin.id,
    checkin_updated_at: ctx.checkin.updated_at,
    template: result.plan.template,
    day_index: result.plan.dayIndex,
    day_name: result.plan.dayName,
    is_deload: result.plan.deload.deload,
    readiness_level: result.plan.readiness.level,
    readiness_reasons: result.plan.readiness.tags,
    plan: result.plan,
    source: result.source,
    model: result.model,
    prompt_version: result.promptVersion,
    ai_raw_output: result.rawOutput,
    validation: result.validation,
    build_count: buildCount,
    updated_at: now.toISOString(),
  });
  if (error) return { error };
  return { built: { date, source: result.source, buildsLeft: buildsLeft(buildCount) } };
}

/** True when the check-in was edited after the session was built. */
export function checkinChangedSince(sessionCheckinUpdatedAt: string, checkinUpdatedAt: string | null | undefined): boolean {
  if (!checkinUpdatedAt) return false;
  return Date.parse(checkinUpdatedAt) > Date.parse(sessionCheckinUpdatedAt);
}
