import { findExercise, getExercise } from "@/lib/exercises/library";
import { checkProgram, type ProgramCheck } from "@/lib/engine/programCheck";
import { prescribe } from "@/lib/engine/prescription";
import { buildCycle, isSplitAllowed, RECOMMENDED_SPLIT, SPLIT_NAMES, SPLITS, splitCycle, type SplitId } from "@/lib/engine/templates";
import type { EquipmentSetup, Experience, Goal, PlannedExercise } from "@/lib/engine/types";
import type { Program, ProgramDay } from "./types";

export type ProgramProfile = { experience: Experience; equipment: EquipmentSetup; daysPerWeek: number };

/** A template program for the user: the split's cycle filled by the engine's week builder. */
export function generateProgram(split: SplitId, profile: ProgramProfile): Program {
  return {
    name: SPLIT_NAMES[split],
    source: "template",
    split,
    days: buildCycle({ ...profile, split }),
  };
}

export const recommendedProgram = (profile: ProgramProfile) => generateProgram(RECOMMENDED_SPLIT[profile.daysPerWeek], profile);

/** A program day's exercises, prescribed for the goal (rep ranges, RIR, rest), with any rep overrides. */
export function prescribeDay(day: ProgramDay, goal: Goal): PlannedExercise[] {
  return day.exercises.map((e) => {
    const planned = prescribe(getExercise(e.exerciseId), goal, e.sets);
    return e.repMin != null && e.repMax != null ? { ...planned, repMin: e.repMin, repMax: e.repMax } : planned;
  });
}

/** True when a split's cycle doesn't line up with the week, so it rolls over (e.g. PPL on 4 days). */
export const isRolling = (split: SplitId, daysPerWeek: number) => splitCycle(split, daysPerWeek).length !== daysPerWeek;

/** The engine's check of a program at the user's days per week and experience. */
export const checkFor = (program: Pick<Program, "days">, profile: Pick<ProgramProfile, "daysPerWeek" | "experience">): ProgramCheck =>
  checkProgram({ days: program.days, daysPerWeek: profile.daysPerWeek, experience: profile.experience });

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/**
 * Reads a stored program, checking every field. Anything unexpected (an exercise the library no
 * longer has, a bad number) returns null, and the caller regenerates from the template.
 */
export function parseProgram(row: { name: unknown; source: unknown; split: unknown; days: unknown }): Program | null {
  if (typeof row.name !== "string" || (row.source !== "template" && row.source !== "custom")) return null;
  const split = row.split == null ? null : (SPLITS as readonly unknown[]).includes(row.split) ? (row.split as SplitId) : undefined;
  if (split === undefined || (row.source === "template" && split === null)) return null;
  if (!Array.isArray(row.days) || row.days.length < 1 || row.days.length > 6) return null;

  const days: ProgramDay[] = [];
  for (const d of row.days) {
    if (!isObject(d) || typeof d.name !== "string" || !Array.isArray(d.exercises) || d.exercises.length === 0) return null;
    const exercises: ProgramDay["exercises"] = [];
    for (const e of d.exercises) {
      if (!isObject(e) || typeof e.exerciseId !== "string" || !findExercise(e.exerciseId) || !isInt(e.sets, 1, 10)) return null;
      const hasReps = e.repMin != null || e.repMax != null;
      if (hasReps && !(isInt(e.repMin, 1, 30) && isInt(e.repMax, 1, 30) && e.repMin <= e.repMax)) return null;
      exercises.push(hasReps ? { exerciseId: e.exerciseId, sets: e.sets, repMin: e.repMin as number, repMax: e.repMax as number } : { exerciseId: e.exerciseId, sets: e.sets });
    }
    days.push({ name: d.name, exercises });
  }
  return { name: row.name, source: row.source, split, days };
}

/** The `programs` table row (see supabase/migrations/0005_programs.sql). */
export type ProgramRow = {
  name: string;
  source: string;
  split: string | null;
  days: unknown;
  /** Set when the user replaces their program: sessions built before it don't count for the rotation. */
  rotation_reset_at: string | null;
};

/**
 * The user's program: the stored one, or (first time, for users from before slice 5c, or if the
 * stored one is unreadable) their recommended template, which `needsSave` asks the caller to store.
 * The recommended template is exactly what sessions were built from before programs were stored.
 */
export function resolveProgram(
  row: ProgramRow | null,
  profile: ProgramProfile,
): { program: Program; rotationResetAt: string | null; needsSave: boolean } {
  const stored = row && parseProgram(row);
  if (stored) return { program: stored, rotationResetAt: row.rotation_reset_at, needsSave: false };
  return { program: recommendedProgram(profile), rotationResetAt: row?.rotation_reset_at ?? null, needsSave: true };
}

export { isSplitAllowed };
