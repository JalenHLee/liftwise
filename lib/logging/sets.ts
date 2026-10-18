import { getExercise } from "@/lib/exercises/library";
import { NOTE_MAX_LENGTH } from "@/lib/checkin/logic";
import { targetReps } from "@/lib/session/display";
import type { SessionExercise, SessionPlan } from "@/lib/session/types";
import type { LoggedSetRow } from "./types";

/** The quick RIR pick: 0, 1, 2, 3, 4+. */
export const RIR_OPTIONS = [0, 1, 2, 3, 4] as const;
export const RIR_LABELS: Partial<Record<number, string>> = { 4: "4+" };
export const MAX_REPS = 100;
export const MAX_WEIGHT_KG = 999;

/** What a set row starts with: weight (null = the user enters it), reps and RIR. */
export type SetDraft = { weightKg: number | null; reps: number; rir: number };

export const isBodyweight = (e: SessionExercise) => getExercise(e.exerciseId).loadIncrementKg <= 0;

/** This exercise's logged sets, in set order. */
export const setsOf = (exerciseId: string, sets: LoggedSetRow[]) =>
  sets.filter((s) => s.exercise_id === exerciseId).sort((a, b) => a.set_number - b.set_number);

/**
 * The prefilled values for set `setNumber`: the weight from the nearest earlier logged set of
 * this exercise (so after calibration's first set, later sets follow it), else today's planned
 * weight, else empty for calibration. Reps = today's target; RIR = the low end of the target.
 */
export function prefill(exercise: SessionExercise, setNumber: number, sets: LoggedSetRow[]): SetDraft {
  const earlier = setsOf(exercise.exerciseId, sets).filter((s) => s.set_number < setNumber && s.weight_kg !== null);
  const weightKg = isBodyweight(exercise)
    ? null
    : (earlier.at(-1)?.weight_kg ?? (exercise.load.kind === "weight" ? exercise.load.kg : null));
  return { weightKg, reps: targetReps(exercise), rir: Math.min(exercise.rirMin, 4) };
}

/** −/+ by the exercise's increment, never below one increment. Empty starts at one increment. */
export function stepWeight(kg: number | null, incrementKg: number, direction: 1 | -1): number {
  if (kg === null) return incrementKg;
  const next = Math.round((kg + direction * incrementKg) * 100) / 100;
  return Math.min(MAX_WEIGHT_KG, Math.max(incrementKg, next));
}

export const stepReps = (reps: number, direction: 1 | -1) => Math.min(MAX_REPS, Math.max(0, reps + direction));

/** Typed weight: "62.5" or "62,5" -> 62.5; anything else -> null. */
export function parseWeight(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

/** Why a set can't be logged yet, or null when it can. */
export function setProblem(exercise: SessionExercise, draft: SetDraft): string | null {
  if (!isBodyweight(exercise)) {
    if (draft.weightKg === null) return "Enter the weight you used.";
    if (!(draft.weightKg > 0 && draft.weightKg <= MAX_WEIGHT_KG)) return "That weight doesn't look right.";
  }
  if (!Number.isInteger(draft.reps) || draft.reps < 0 || draft.reps > MAX_REPS) return "Reps should be a whole number from 0 to 100.";
  if (!RIR_OPTIONS.includes(draft.rir as (typeof RIR_OPTIONS)[number])) return "Pick reps in reserve.";
  return null;
}

/** The set row for the database. */
export function toRow(sessionId: string, exercise: SessionExercise, setNumber: number, draft: SetDraft, id: string, loggedAt: string): LoggedSetRow {
  return {
    id,
    session_id: sessionId,
    exercise_id: exercise.exerciseId,
    set_number: setNumber,
    weight_kg: isBodyweight(exercise) ? null : draft.weightKg,
    reps: draft.reps,
    rir: draft.rir,
    logged_at: loggedAt,
  };
}

export type SetRef = { exerciseId: string; setNumber: number };

/** The next set to log: the first unlogged set of the first exercise that isn't skipped. */
export function nextSet(plan: SessionPlan, sets: LoggedSetRow[], skipped: string[]): SetRef | null {
  for (const e of plan.exercises) {
    if (skipped.includes(e.exerciseId)) continue;
    const done = new Set(setsOf(e.exerciseId, sets).map((s) => s.set_number));
    for (let n = 1; n <= e.sets; n++) if (!done.has(n)) return { exerciseId: e.exerciseId, setNumber: n };
  }
  return null;
}

export type WorkoutSummary = {
  setsDone: number;
  setsPlanned: number;
  /** Weight × reps over all weighted sets, in kg. Bodyweight sets don't count. */
  volumeKg: number;
  /** Exercises with at least one logged set. */
  liftsDone: number;
  liftsPlanned: number;
  skipped: number;
};

export function summarize(plan: SessionPlan, sets: LoggedSetRow[], skipped: string[]): WorkoutSummary {
  const inPlan = new Set(plan.exercises.map((e) => e.exerciseId));
  const logged = sets.filter((s) => inPlan.has(s.exercise_id));
  return {
    setsDone: logged.length,
    setsPlanned: plan.exercises.reduce((n, e) => n + e.sets, 0),
    volumeKg: Math.round(logged.reduce((kg, s) => kg + (s.weight_kg ?? 0) * s.reps, 0)),
    liftsDone: new Set(logged.map((s) => s.exercise_id)).size,
    liftsPlanned: plan.exercises.length,
    skipped: plan.exercises.filter((e) => skipped.includes(e.exerciseId)).length,
  };
}

export const RATINGS = [1, 2, 3, 4, 5] as const;

/** Checks the end-of-workout form. The rating is required; the note is optional. */
export function validateFinish(input: { rating: unknown; note: unknown }): { rating: number; note: string | null } | { error: string } {
  const { rating, note } = input;
  if (typeof rating !== "number" || !RATINGS.includes(rating as (typeof RATINGS)[number])) return { error: "Pick how it went, from 1 to 5." };
  if (note !== null && note !== undefined && typeof note !== "string") return { error: "That note doesn't look right." };
  const text = (note ?? "").trim();
  if (text.length > NOTE_MAX_LENGTH) return { error: `Keep the note under ${NOTE_MAX_LENGTH} characters.` };
  return { rating, note: text || null };
}

/** A finished workout can be resumed only on its own local day. */
export const canResume = (sessionDate: string, localToday: string) => sessionDate === localToday;
