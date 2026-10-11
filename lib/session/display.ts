import type { SessionExercise, SessionPlan } from "./types";

const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

/**
 * True when there's no single rep target to show: calibration (the user picks the weight) or
 * bodyweight without history. We show the rep range instead.
 */
export const isCalibrating = (e: SessionExercise) => e.targetReps === undefined && e.load.kind !== "weight";

/** Reps to aim for on each set: progression's target, else the top of the range (the starting weight was worked out for it). */
export const targetReps = (e: SessionExercise) => e.targetReps ?? e.repMax;

/**
 * The big serif line. With a weight or a progression target: "3 × 10" (or "3 × 8" when aiming
 * for one more rep). Calibration and first-time bodyweight show the range: "3 × 5–10".
 */
export function setsByReps(e: SessionExercise): string {
  return `${e.sets} × ${isCalibrating(e) ? range(e.repMin, e.repMax) : targetReps(e)}`;
}

export const repsPerSet = (e: SessionExercise) => `${isCalibrating(e) ? range(e.repMin, e.repMax) : targetReps(e)} reps`;

/** "62.5" or "60": kilograms without trailing zeros. */
export const formatKg = (kg: number) => (Number.isInteger(kg) ? `${kg}` : `${Math.round(kg * 100) / 100}`);

export function weightLabel(e: SessionExercise): string | null {
  if (e.load.kind === "weight") return `${formatKg(e.load.kg)} kg`;
  if (e.load.kind === "bodyweight") return "Bodyweight";
  return null;
}

/** Small mono details under the big line, e.g. ["RANGE 5–10", "RIR 3", "REST 2:30"]. */
export function details(e: SessionExercise): string[] {
  const rest = `${Math.floor(e.restSeconds / 60)}:${String(e.restSeconds % 60).padStart(2, "0")}`;
  return [...(isCalibrating(e) ? [] : [`Range ${range(e.repMin, e.repMax)}`]), `RIR ${range(e.rirMin, e.rirMax)}`, `Rest ${rest}`];
}

/** The day's RIR target across all exercises, e.g. "1–3" or "4". */
export function rirTarget(plan: SessionPlan): string {
  if (!plan.exercises.length) return "–";
  return range(Math.min(...plan.exercises.map((e) => e.rirMin)), Math.max(...plan.exercises.map((e) => e.rirMax)));
}

/** Short reasons for the readiness card, including anything read from the note. */
export function readinessTags(plan: SessionPlan): string[] {
  const fromNote = [
    ...plan.fromNote.painAreas.map((a) => `note: ${a.replace(/_/g, " ")} pain`),
    ...Object.entries(plan.fromNote.soreness).map(([m]) => `note: sore ${m}`),
  ];
  return [...(plan.deload.deload ? ["deload week"] : []), ...plan.readiness.tags, ...fromNote];
}
