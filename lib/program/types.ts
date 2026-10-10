import type { SplitId } from "@/lib/engine/templates";

/** One exercise in a program day. Sets and rep-range overrides are for custom programs (slice 8). */
export type ProgramExercise = {
  exerciseId: string;
  sets: number;
  /** Optional overrides; when missing the rep range comes from the goal. */
  repMin?: number;
  repMax?: number;
};

export type ProgramDay = { name: string; exercises: ProgramExercise[] };

export type ProgramSource = "template" | "custom";

/** A user's active program: ordered days that rotate in order (decision 17). */
export type Program = {
  name: string;
  source: ProgramSource;
  /** The split a template program was generated from; null for custom programs. */
  split: SplitId | null;
  days: ProgramDay[];
};
