import { getExercise } from "@/lib/exercises/library";
import { applyDeload } from "@/lib/engine/deload";
import { maxLoadFor } from "@/lib/engine/equipment";
import { applyPain, applySoreness, applyTimeLimit, estimateMinutes } from "@/lib/engine/modifiers";
import { applyReadiness, scoreReadiness } from "@/lib/engine/readiness";
import { startingLoadFor, type RecentSet } from "@/lib/engine/startingLoad";
import { MUSCLES, type CheckIn, type EquipmentSetup, type Exercise, type Experience, type Goal, type PlannedExercise, type Readiness } from "@/lib/engine/types";
import { prescribeDay } from "@/lib/program/program";
import type { Program } from "@/lib/program/types";
import type { SessionExercise, SessionLoad, SessionPlan } from "./types";

export type DraftProfile = {
  goal: Goal;
  experience: Experience;
  equipment: EquipmentSetup;
};

export type DraftInput = {
  profile: DraftProfile;
  /** The user's stored program; today's day is `program.days[dayIndex]`. */
  program: Program;
  dayIndex: number;
  checkIn: CheckIn;
  /** Last solid set per exercise id, from onboarding. */
  startingWeights: Record<string, RecentSet>;
  deload: { deload: boolean; reasons: string[] };
  /** What Claude read in the note, recorded on the plan (already merged into `checkIn`). */
  fromNote?: SessionPlan["fromNote"];
};

const setsLabel = (n: number) => `${n} SET${n === 1 ? "" : "S"}`;

/** "5.5h sleep" -> "SLEEP", "energy 2/5" -> "ENERGY", "sore quads" -> "SORENESS". */
function yellowCause(tags: string[]): string {
  const first = tags[0] ?? "";
  if (first.includes("sleep")) return "SLEEP";
  if (first.startsWith("energy")) return "ENERGY";
  return "SORENESS";
}

/** The program day's exercises, prescribed for the goal. */
export function programDay(program: Program, goal: Goal, dayIndex: number) {
  const day = program.days[dayIndex % program.days.length];
  return { template: program.split ?? ("custom" as const), dayCount: program.days.length, name: day.name, exercises: prescribeDay(day, goal) };
}

/** Starting weight from onboarding, else calibration; bodyweight exercises are "bodyweight". */
export function loadFor(exercise: Exercise, goal: Goal, setup: EquipmentSetup, recent: RecentSet | undefined): SessionLoad {
  if (exercise.loadIncrementKg <= 0) return { kind: "bodyweight" };
  const start = startingLoadFor(exercise, goal, recent);
  if (start.kind === "calibration") return start;
  const cap = maxLoadFor(exercise, setup);
  return { kind: "weight", kg: cap === undefined ? start.kg : Math.min(start.kg, cap) };
}

export function rulesExplanation(adjustments: string[]): string | null {
  return adjustments.length ? `${adjustments.join(". ")}.` : null;
}

const READINESS_SENTENCE: Record<Readiness, string> = {
  green: "Green day: the plan as written.",
  yellow: "Yellow day: one fewer set per exercise and easier effort, with weights held.",
  red: "Red day: about half the sets with weights held, so you can recover.",
};

/** The 1–2 sentence day summary used when Claude isn't (or can't be) used. */
export function rulesSummary(plan: Pick<SessionPlan, "readiness" | "deload" | "removedForPain" | "droppedForTime" | "exercises">): string {
  const first = plan.deload.deload
    ? `Deload week: half the sets at the same weight, with 4 reps in reserve.`
    : READINESS_SENTENCE[plan.readiness.level];
  let second = "";
  if (plan.removedForPain.length) second = "Exercises that load the painful area are out today.";
  else if (plan.droppedForTime.length || plan.exercises.some((e) => e.tags.some((t) => t.endsWith("TIME")))) {
    second = "Trimmed to fit your time, with rest kept the same.";
  } else if (plan.exercises.some((e) => e.load.kind === "calibration")) {
    second = "Some lifts are new, so pick their weights as described.";
  }
  return second ? `${first} ${second}` : first;
}

/**
 * The rules-only plan for today: program day -> deload -> readiness -> pain -> soreness -> time
 * (decision 10), with weights from onboarding and template explanations. No AI involved.
 */
export function buildDraft(input: DraftInput): SessionPlan {
  const { profile, checkIn } = input;
  const day = programDay(input.program, profile.goal, input.dayIndex);
  const readiness = scoreReadiness(checkIn);
  const tags = new Map<string, string[]>(day.exercises.map((e) => [e.exerciseId, []]));
  const tag = (id: string, t: string) => tags.get(id)?.push(t);

  // Runs one engine step and tags every exercise whose sets dropped.
  const step = (before: PlannedExercise[], after: PlannedExercise[], label: (lost: number) => string | null) => {
    for (const a of after) {
      const b = before.find((e) => e.exerciseId === a.exerciseId);
      if (!b) continue;
      const t = label(b.sets - a.sets);
      if (t) tag(a.exerciseId, t);
    }
    return after;
  };

  let plan = day.exercises;
  if (input.deload.deload) plan = step(plan, applyDeload(plan), () => "DELOAD");
  if (readiness.level === "yellow") {
    const cause = yellowCause(readiness.tags);
    plan = step(plan, applyReadiness(plan, "yellow"), (lost) => (lost > 0 ? `−${setsLabel(lost)} · ${cause}` : `RIR 3+ · ${cause}`));
  } else if (readiness.level === "red") {
    plan = step(plan, applyReadiness(plan, "red"), (lost) => (lost > 0 ? "½ SETS · RED DAY" : "RED DAY"));
  }

  // Deload and readiness changes apply to every exercise and are explained once, on the readiness
  // card; each exercise's own explanation only covers what's specific to it.
  const dayWide = new Map(plan.map((e) => [e.exerciseId, e.adjustments.length]));

  const pain = applyPain(plan, checkIn.painAreas);
  plan = pain.exercises;

  plan = applySoreness(plan, checkIn.soreness);
  for (const e of plan) {
    const muscle = getExercise(e.exerciseId).primaryMuscle;
    if ((checkIn.soreness[muscle] ?? 1) >= 4) tag(e.exerciseId, `½ SETS · SORE ${muscle.toUpperCase()}`);
  }

  const beforeTime = plan;
  plan = step(plan, applyTimeLimit(plan, checkIn.minutesAvailable), (lost) => (lost > 0 ? `−${setsLabel(lost)} · TIME` : null));
  const droppedForTime = beforeTime.filter((b) => !plan.some((a) => a.exerciseId === b.exerciseId));

  const exercises: SessionExercise[] = plan.map((e) => {
    const exercise = getExercise(e.exerciseId);
    return {
      ...e,
      name: exercise.name,
      load: loadFor(exercise, profile.goal, profile.equipment, input.startingWeights[e.exerciseId]),
      tags: tags.get(e.exerciseId) ?? [],
      explanation: rulesExplanation(e.adjustments.slice(dayWide.get(e.exerciseId) ?? 0)),
    };
  });

  const named = (ids: string[]) => ids.map((id) => ({ id, name: getExercise(id).name }));
  const result: SessionPlan = {
    template: day.template,
    dayIndex: input.dayIndex % day.dayCount,
    dayCount: day.dayCount,
    dayName: day.name,
    readiness: { level: readiness.level, tags: readiness.tags },
    deload: input.deload,
    exercises,
    removedForPain: named(pain.removedIds),
    droppedForTime: named(droppedForTime.map((e) => e.exerciseId)),
    painMessage: pain.message,
    fromNote: input.fromNote ?? { painAreas: [], soreness: {} },
    estimatedMinutes: Math.round(estimateMinutes(plan)),
    summary: "",
  };
  result.summary = rulesSummary(result);
  return result;
}

/** Soreness is only ever raised, never lowered; muscles not listed stay as they were. */
export function mergeCheckIn(
  checkIn: CheckIn,
  added: { painAreas: CheckIn["painAreas"]; soreness: CheckIn["soreness"] },
): CheckIn {
  const soreness = { ...checkIn.soreness };
  for (const m of MUSCLES) {
    const level = added.soreness[m];
    if (level !== undefined && level > (soreness[m] ?? 1)) soreness[m] = level;
  }
  const painAreas = [...new Set([...checkIn.painAreas, ...added.painAreas])];
  return { ...checkIn, soreness, painAreas };
}
