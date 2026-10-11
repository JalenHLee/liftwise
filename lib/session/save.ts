import { isPlausibleLocalDate, toEngineCheckIn } from "@/lib/checkin/logic";
import { rowToSaved, type CheckinRow } from "@/lib/checkin/save";
import type { RecentSet } from "@/lib/engine/startingLoad";
import { EQUIPMENT_SETUPS, EXPERIENCES, GOALS, type EquipmentSetup, type Experience, type Goal, type Readiness } from "@/lib/engine/types";
import type { AiClient } from "./ai";
import { resolveProgram, type ProgramRow } from "@/lib/program/program";
import { generateSession } from "./generate";
import { dayNumber, deloadToday, rotationFor } from "./schedule";
import type { SessionPlan, SessionSource, ValidationResult } from "./types";

import { buildsLeft, MAX_BUILDS_PER_DAY } from "./limits";

export { buildsLeft, MAX_BUILDS_PER_DAY };
/** Starting sets saved before slice 5a have no reps; treat them as 5 (decision 16). */
export const DEFAULT_STARTING_REPS = 5;


export type BuildContext = {
  profile: { goal: string; experience: string; equipment: string; days_per_week: number } | null;
  checkin: (CheckinRow & { id: string; updated_at: string }) | null;
  startingWeights: { exercise_id: string; weight_kg: number; reps: number | null }[];
  /** The stored program; null for users from before slice 5c (created on first use). */
  program: ProgramRow | null;
  /** Every earlier-or-same-day session (small: one row per training day). */
  sessions: { session_date: string; day_index: number; is_deload: boolean; build_count: number; updated_at: string }[];
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
  /** Stores a program generated for a user who didn't have one yet. */
  saveProgram(userId: string, row: ProgramRow): Promise<{ error: string | null }>;
};

/** What the user asked to build: their local date, and optionally a program day they picked. */
export type BuildRequest = { date: string; dayIndex?: number };

export type BuildResult = { built: { date: string; source: SessionSource; buildsLeft: number } } | { error: string };

const oneOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/**
 * Builds (or rebuilds) the user's session for their local `date` and saves it, on the picked
 * program day or else the next day in the rotation. Needs today's check-in; refuses after the
 * daily rebuild limit.
 */
export async function buildSessionForUser(
  store: SessionStore,
  userId: string,
  request: BuildRequest,
  ai: AiClient | null,
  now: Date = new Date(),
): Promise<BuildResult> {
  const { date } = request;
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

  const profile = { goal: p.goal, experience: p.experience, equipment: p.equipment };
  const resolved = resolveProgram(ctx.program, { ...profile, daysPerWeek: p.days_per_week });
  const { program } = resolved;
  if (request.dayIndex !== undefined && !(Number.isInteger(request.dayIndex) && request.dayIndex >= 0 && request.dayIndex < program.days.length)) {
    return { error: "That day isn't in your program. Please refresh and try again." };
  }
  if (resolved.needsSave) {
    const { error } = await store.saveProgram(userId, {
      name: program.name,
      source: program.source,
      split: program.split,
      days: program.days,
      rotation_reset_at: resolved.rotationResetAt,
    });
    if (error) return { error };
  }

  const earlier = ctx.sessions.filter((s) => dayNumber(s.session_date) < dayNumber(date));
  const dayIndex =
    request.dayIndex ??
    rotationFor({ sessions: ctx.sessions, today: date, dayCount: program.days.length, rotationResetAt: resolved.rotationResetAt }).dayIndex;
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
    { profile, program, dayIndex, checkIn: toEngineCheckIn(saved.form), note: saved.form.note, startingWeights, deload },
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
