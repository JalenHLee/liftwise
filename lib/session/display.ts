import type { SessionExercise, SessionPlan } from "./types";

const range = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

/** True when the user picks the weight (calibration) or it's bodyweight: we show the rep range, not a single target. */
export const isCalibrating = (e: SessionExercise) => e.load.kind !== "weight";

/**
 * The big serif line. With a starting weight, the target is the top of the range (the weight
 * was worked out for it): "3 × 10". Calibration and bodyweight show the range: "3 × 5–10".
 */
export function setsByReps(e: SessionExercise): string {
  return `${e.sets} × ${isCalibrating(e) ? range(e.repMin, e.repMax) : e.repMax}`;
}

export const repsPerSet = (e: SessionExercise) => `${isCalibrating(e) ? range(e.repMin, e.repMax) : e.repMax} reps`;

export function weightLabel(e: SessionExercise): string | null {
  if (e.load.kind === "weight") return `${Number.isInteger(e.load.kg) ? e.load.kg : e.load.kg.toFixed(1)} kg`;
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
