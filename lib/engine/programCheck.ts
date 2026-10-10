import { MUSCLES, type Experience, type Muscle, type PlannedExercise } from "./types";
import { MAX_SETS_PER_MUSCLE_PER_SESSION, sessionVolume, WEEKLY_SET_BANDS } from "./volume";

export type MuscleWeek = {
  /** Average sessions a week with at least 1 hard set for this muscle. */
  timesPerWeek: number;
  /** Average hard sets a week (decision 2 counting). */
  setsPerWeek: number;
  /** Most hard sets in any one session. */
  maxPerSession: number;
};

export type ProgramIssue =
  | { kind: "untrained"; muscles: Muscle[] }
  | { kind: "low_frequency"; muscles: { muscle: Muscle; timesPerWeek: number }[] }
  | { kind: "below_band"; muscles: { muscle: Muscle; setsPerWeek: number }[]; band: { min: number; max: number } }
  | { kind: "above_band"; muscles: { muscle: Muscle; setsPerWeek: number }[]; band: { min: number; max: number } }
  | { kind: "session_cap"; muscles: Muscle[] };

export type ProgramCheck = { muscles: Record<Muscle, MuscleWeek>; issues: ProgramIssue[] };

export type CheckableDay = { exercises: Pick<PlannedExercise, "exerciseId" | "sets">[] };

/** Rounds to 1 decimal place, so 1.3333 reads as 1.3 and float noise disappears. */
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Checks a program against the training rules. Days rotate in order, so a cycle of N days run
 * on D days a week repeats D/N times a week on average: weekly frequency and volume are the
 * cycle's totals scaled by D/N (e.g. Push/Pull/Legs on 4 days trains each muscle ≈1.3× a week).
 */
export function checkProgram(input: { days: CheckableDay[]; daysPerWeek: number; experience: Experience }): ProgramCheck {
  const scale = input.daysPerWeek / input.days.length;
  const perDay = input.days.map((d) => sessionVolume(d.exercises as PlannedExercise[]));
  const muscles = Object.fromEntries(
    MUSCLES.map((m) => {
      const trained = perDay.filter((v) => v[m] >= 1).length;
      const total = perDay.reduce((sum, v) => sum + v[m], 0);
      return [m, { timesPerWeek: round1(trained * scale), setsPerWeek: round1(total * scale), maxPerSession: Math.max(0, ...perDay.map((v) => v[m])) }];
    }),
  ) as Record<Muscle, MuscleWeek>;

  const band = WEEKLY_SET_BANDS[input.experience];
  const issues: ProgramIssue[] = [];
  const untrained = MUSCLES.filter((m) => muscles[m].timesPerWeek === 0);
  const trained = MUSCLES.filter((m) => muscles[m].timesPerWeek > 0);
  if (untrained.length) issues.push({ kind: "untrained", muscles: untrained });

  const low = trained.filter((m) => muscles[m].timesPerWeek < 2);
  if (low.length) issues.push({ kind: "low_frequency", muscles: low.map((m) => ({ muscle: m, timesPerWeek: muscles[m].timesPerWeek })) });

  const below = trained.filter((m) => muscles[m].setsPerWeek < band.min);
  if (below.length) issues.push({ kind: "below_band", band, muscles: below.map((m) => ({ muscle: m, setsPerWeek: muscles[m].setsPerWeek })) });

  const above = trained.filter((m) => muscles[m].setsPerWeek > band.max);
  if (above.length) issues.push({ kind: "above_band", band, muscles: above.map((m) => ({ muscle: m, setsPerWeek: muscles[m].setsPerWeek })) });

  const capped = MUSCLES.filter((m) => muscles[m].maxPerSession > MAX_SETS_PER_MUSCLE_PER_SESSION);
  if (capped.length) issues.push({ kind: "session_cap", muscles: capped });

  return { muscles, issues };
}
