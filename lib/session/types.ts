import type { TemplateName } from "@/lib/engine/templates";
import type { Muscle, PainArea, PlannedExercise, Readiness } from "@/lib/engine/types";

/** What goes on the bar: a starting weight, a calibration instruction, or bodyweight. */
export type SessionLoad =
  | { kind: "weight"; kg: number }
  | { kind: "calibration"; instruction: string }
  | { kind: "bodyweight" };

export type SessionExercise = PlannedExercise & {
  name: string;
  load: SessionLoad;
  /** Short mono labels for each change, e.g. "−1 SET · SLEEP". */
  tags: string[];
  /** One sentence on why this exercise changed today; null when it's as written. */
  explanation: string | null;
  /** Set when Claude swapped this in; the id of the exercise it replaced. */
  swappedFrom?: string;
};

export type SessionPlan = {
  template: TemplateName;
  dayIndex: number;
  /** Days in the program's rotation, e.g. 4 for Upper/Lower. */
  dayCount: number;
  dayName: string;
  readiness: { level: Readiness; tags: string[] };
  deload: { deload: boolean; reasons: string[] };
  exercises: SessionExercise[];
  removedForPain: { id: string; name: string }[];
  droppedForTime: { id: string; name: string }[];
  painMessage: string | null;
  /** Pain areas and soreness Claude read in the free-text note (only ever more conservative). */
  fromNote: { painAreas: PainArea[]; soreness: Partial<Record<Muscle, number>> };
  estimatedMinutes: number;
  summary: string;
};

export type SessionSource = "ai" | "rules";

export type ValidationResult = {
  ok: boolean;
  /** Why the rules-only plan was used, when it was. */
  fallbackReason?: "no_api_key" | "error" | "timeout" | "invalid_json" | "invalid_output";
  errors: string[];
  /** Valid suggestions that no longer applied after the note made the plan more conservative. */
  dropped: string[];
};
