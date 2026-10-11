import { EXERCISES, getExercise } from "@/lib/exercises/library";
import { isAvailable } from "./equipment";
import { prescribe } from "./prescription";
import type { EquipmentSetup, Exercise, ExerciseType, Experience, Goal, Muscle, PlannedExercise } from "./types";
import { MAX_SETS_PER_MUSCLE_PER_SESSION, WEEKLY_SET_BANDS } from "./volume";

/** The program splits. A split is a cycle of day types; days rotate in order (decision 17). */
export const SPLITS = ["full_body", "upper_lower", "push_pull_legs", "push_pull_legs_upper_lower"] as const;
export type SplitId = (typeof SPLITS)[number];
/** Kept for older code: a template is a split. */
export type TemplateName = SplitId;
export type SessionType = "full_body" | "upper" | "lower" | "push" | "pull" | "legs";
type SlotSpec = [Muscle, ExerciseType];
type FilledSlot = { exercise: Exercise; sets: number };

const SLOTS: Record<SessionType, SlotSpec[]> = {
  full_body: [
    ["quads", "compound"], ["chest", "compound"], ["back", "compound"], ["hamstrings", "compound"],
    ["shoulders", "compound"], ["glutes", "compound"], ["quads", "isolation"], ["chest", "isolation"],
    ["back", "compound"], ["hamstrings", "isolation"], ["shoulders", "isolation"], ["biceps", "isolation"],
    ["triceps", "isolation"], ["calves", "isolation"], ["core", "isolation"],
  ],
  upper: [
    ["chest", "compound"], ["back", "compound"], ["shoulders", "compound"], ["back", "compound"],
    ["chest", "isolation"], ["shoulders", "isolation"], ["biceps", "isolation"], ["triceps", "isolation"],
  ],
  lower: [
    ["quads", "compound"], ["hamstrings", "compound"], ["glutes", "compound"], ["quads", "isolation"],
    ["hamstrings", "isolation"], ["calves", "isolation"], ["core", "isolation"],
  ],
  push: [
    ["chest", "compound"], ["shoulders", "compound"], ["chest", "compound"], ["chest", "isolation"],
    ["shoulders", "isolation"], ["triceps", "isolation"],
  ],
  pull: [
    ["back", "compound"], ["back", "compound"], ["shoulders", "isolation"], ["biceps", "isolation"],
    ["core", "isolation"],
  ],
  legs: [
    ["quads", "compound"], ["hamstrings", "compound"], ["glutes", "compound"], ["quads", "isolation"],
    ["hamstrings", "isolation"], ["calves", "isolation"], ["core", "isolation"],
  ],
};

/** Days per week each split can be used for (decision 22). */
export const SPLIT_DAYS: Record<SplitId, readonly number[]> = {
  full_body: [2, 3, 4, 5],
  upper_lower: [2, 3, 4, 5, 6],
  push_pull_legs: [3, 4, 5, 6],
  push_pull_legs_upper_lower: [5],
};

/** The app's choice for each number of days (unchanged since slice 2). */
export const RECOMMENDED_SPLIT: Record<number, SplitId> = {
  2: "full_body",
  3: "full_body",
  4: "upper_lower",
  5: "push_pull_legs_upper_lower",
  6: "push_pull_legs",
};

export const SPLIT_NAMES: Record<SplitId, string> = {
  full_body: "Full Body",
  upper_lower: "Upper / Lower",
  push_pull_legs: "Push / Pull / Legs",
  push_pull_legs_upper_lower: "Push / Pull / Legs / Upper / Lower",
};

/** Splits offered for a number of days, the recommended one first. */
export function splitsFor(daysPerWeek: number): SplitId[] {
  const recommended = RECOMMENDED_SPLIT[daysPerWeek];
  if (!recommended) return [];
  return [recommended, ...SPLITS.filter((s) => s !== recommended && SPLIT_DAYS[s].includes(daysPerWeek))];
}

export const isSplitAllowed = (split: string, daysPerWeek: number): split is SplitId =>
  (SPLITS as readonly string[]).includes(split) && SPLIT_DAYS[split as SplitId].includes(daysPerWeek);

/**
 * The split's cycle of days. When the split fits the week exactly (Upper/Lower on an even number
 * of days, Push/Pull/Legs on 3 or 6) the cycle is one week. Otherwise it repeats a fixed cycle
 * (Upper, Lower ×2 or Push, Pull, Legs ×2) that "rolls" over weeks, e.g. PPL on 4 days.
 */
export function splitCycle(split: SplitId, daysPerWeek: number): SessionType[] {
  const repeat = (days: SessionType[], times: number) => Array.from({ length: times }, () => days).flat();
  switch (split) {
    case "full_body":
      return repeat(["full_body"], daysPerWeek);
    case "upper_lower":
      return repeat(["upper", "lower"], daysPerWeek % 2 === 0 ? daysPerWeek / 2 : 2);
    case "push_pull_legs":
      return repeat(["push", "pull", "legs"], daysPerWeek % 3 === 0 ? daysPerWeek / 3 : 2);
    case "push_pull_legs_upper_lower":
      return ["push", "pull", "legs", "upper", "lower"];
  }
}

const SESSION_NAMES: Record<SessionType, string> = {
  full_body: "Full Body", upper: "Upper", lower: "Lower", push: "Push", pull: "Pull", legs: "Legs",
};

const SETS_BEFORE_SPREADING = 3;

export type WeekPlanInput = {
  daysPerWeek: number;
  experience: Experience;
  equipment: EquipmentSetup;
  goal: Goal;
};

export type WeekPlan = {
  template: TemplateName;
  sessions: { name: string; exercises: PlannedExercise[] }[];
};

export type CyclePlanInput = Omit<WeekPlanInput, "goal"> & { split: SplitId };

/** One day of a generated cycle: exercise ids and their sets (rep ranges come from the goal). */
export type CycleDay = { name: string; exercises: { exerciseId: string; sets: number }[] };

/**
 * Picks an exercise for a slot; `variant` rotates choices so repeated days differ.
 * Returns undefined when the setup has nothing left for this muscle in this session.
 */
function pickExercise(
  muscle: Muscle,
  type: ExerciseType,
  setup: EquipmentSetup,
  variant: number,
  used: Set<string>,
): Exercise | undefined {
  const options = (t: ExerciseType) =>
    EXERCISES.filter((e) => e.primaryMuscle === muscle && e.type === t && isAvailable(e, setup) && !used.has(e.id));
  const other: ExerciseType = type === "compound" ? "isolation" : "compound";
  const candidates = options(type).length ? options(type) : options(other);
  return candidates.length ? candidates[variant % candidates.length] : undefined;
}

/**
 * Fills the split's cycle with exercises and sets. Sets go one at a time to the muscle furthest
 * below its weekly minimum. When the cycle is longer or shorter than a week, the weekly targets
 * are scaled by cycle length / days per week, so the AVERAGE week lands in the band.
 */
export function buildCycle(input: CyclePlanInput): CycleDay[] {
  if (!isSplitAllowed(input.split, input.daysPerWeek)) throw new Error("That split isn't available for that many days");
  const cycle = splitCycle(input.split, input.daysPerWeek);
  const band = WEEKLY_SET_BANDS[input.experience];
  // Sets per cycle that average out to the weekly band (exactly the band when cycle = week).
  const target = { min: (band.min * cycle.length) / input.daysPerWeek, max: (band.max * cycle.length) / input.daysPerWeek };

  const seen: Partial<Record<SessionType, number>> = {};
  const sessions = cycle.map((type) => {
    const variant = seen[type] ?? 0;
    seen[type] = variant + 1;
    const used = new Set<string>();
    const slots: FilledSlot[] = [];
    for (const [muscle, kind] of SLOTS[type]) {
      const exercise = pickExercise(muscle, kind, input.equipment, variant, used);
      if (!exercise) continue;
      used.add(exercise.id);
      slots.push({ exercise, sets: 0 });
    }
    return { type, slots };
  });

  const weekly = new Map<Muscle, number>();
  const sessionVol = sessions.map(() => new Map<Muscle, number>());
  const contributions = (e: Exercise): [Muscle, number][] => [
    [e.primaryMuscle, 1],
    ...e.secondaryMuscles.map((m): [Muscle, number] => [m, 0.5]),
  ];

  // Add one set at a time to the muscle furthest below its minimum.
  const blocked = new Set<Muscle>();
  for (;;) {
    const needy = [...new Set(sessions.flatMap((s) => s.slots.map((sl) => sl.exercise.primaryMuscle)))]
      .filter((m) => (weekly.get(m) ?? 0) < target.min && !blocked.has(m))
      .sort((a, b) => (weekly.get(a) ?? 0) - (weekly.get(b) ?? 0));
    if (!needy.length) break;
    const muscle = needy[0];

    // Prefer the session where this muscle has the least work so far. Within it, fill slots in
    // order up to 4 sets each (fewer, fuller exercises), then spread to the slot with fewest sets.
    let best: { s: number; slot: FilledSlot; score: [number, number] } | undefined;
    for (let s = 0; s < sessions.length; s++) {
      for (const slot of sessions[s].slots) {
        if (slot.exercise.primaryMuscle !== muscle) continue;
        const fits = contributions(slot.exercise).every(
          ([m, v]) =>
            (sessionVol[s].get(m) ?? 0) + v <= MAX_SETS_PER_MUSCLE_PER_SESSION &&
            (weekly.get(m) ?? 0) + v <= target.max,
        );
        if (!fits) continue;
        const score: [number, number] = [sessionVol[s].get(muscle) ?? 0, Math.max(slot.sets, SETS_BEFORE_SPREADING)];
        if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) {
          best = { s, slot, score };
        }
      }
    }

    if (!best) {
      blocked.add(muscle);
      continue;
    }
    const { s, slot } = best;
    slot.sets++;
    for (const [m, v] of contributions(slot.exercise)) {
      sessionVol[s].set(m, (sessionVol[s].get(m) ?? 0) + v);
      weekly.set(m, (weekly.get(m) ?? 0) + v);
    }
  }

  return sessions.map(({ type, slots }) => ({
    name: SESSION_NAMES[type],
    exercises: slots.filter((sl) => sl.sets > 0).map((sl) => ({ exerciseId: sl.exercise.id, sets: sl.sets })),
  }));
}

/** The recommended split's week, fully prescribed for the goal. */
export function buildWeek(input: WeekPlanInput): WeekPlan {
  const split = RECOMMENDED_SPLIT[input.daysPerWeek];
  if (!split) throw new Error("Days per week must be between 2 and 6");
  return {
    template: split,
    sessions: buildCycle({ ...input, split }).map((day) => ({
      name: day.name,
      exercises: day.exercises.map((e) => prescribe(getExercise(e.exerciseId), input.goal, e.sets)),
    })),
  };
}
