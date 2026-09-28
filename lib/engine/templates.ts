import { EXERCISES } from "@/lib/exercises/library";
import { isAvailable } from "./equipment";
import { prescribe } from "./prescription";
import type { EquipmentSetup, Exercise, ExerciseType, Experience, Goal, Muscle, PlannedExercise } from "./types";
import { MAX_SETS_PER_MUSCLE_PER_SESSION, WEEKLY_SET_BANDS } from "./volume";

export type TemplateName = "full_body" | "upper_lower" | "push_pull_legs" | "push_pull_legs_upper_lower";
type SessionType = "full_body" | "upper" | "lower" | "push" | "pull" | "legs";
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

const WEEKS: Record<number, { template: TemplateName; days: SessionType[] }> = {
  2: { template: "full_body", days: ["full_body", "full_body"] },
  3: { template: "full_body", days: ["full_body", "full_body", "full_body"] },
  4: { template: "upper_lower", days: ["upper", "lower", "upper", "lower"] },
  5: { template: "push_pull_legs_upper_lower", days: ["push", "pull", "legs", "upper", "lower"] },
  6: { template: "push_pull_legs", days: ["push", "pull", "legs", "push", "pull", "legs"] },
};

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

export function buildWeek(input: WeekPlanInput): WeekPlan {
  const week = WEEKS[input.daysPerWeek];
  if (!week) throw new Error("Days per week must be between 2 and 6");
  const band = WEEKLY_SET_BANDS[input.experience];

  const seen: Partial<Record<SessionType, number>> = {};
  const sessions = week.days.map((type) => {
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

  // Add one set at a time to the muscle furthest below its weekly minimum.
  const blocked = new Set<Muscle>();
  for (;;) {
    const needy = [...new Set(sessions.flatMap((s) => s.slots.map((sl) => sl.exercise.primaryMuscle)))]
      .filter((m) => (weekly.get(m) ?? 0) < band.min && !blocked.has(m))
      .sort((a, b) => (weekly.get(a) ?? 0) - (weekly.get(b) ?? 0));
    if (!needy.length) break;
    const muscle = needy[0];

    // Prefer the session where this muscle has the least work so far. Within it, fill slots in
    // order up to 3 sets each (fewer, fuller exercises), then spread to the slot with fewest sets.
    let best: { s: number; slot: FilledSlot; score: [number, number] } | undefined;
    for (let s = 0; s < sessions.length; s++) {
      for (const slot of sessions[s].slots) {
        if (slot.exercise.primaryMuscle !== muscle) continue;
        const fits = contributions(slot.exercise).every(
          ([m, v]) =>
            (sessionVol[s].get(m) ?? 0) + v <= MAX_SETS_PER_MUSCLE_PER_SESSION &&
            (weekly.get(m) ?? 0) + v <= band.max,
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

  return {
    template: week.template,
    sessions: sessions.map(({ type, slots }) => ({
      name: SESSION_NAMES[type],
      exercises: slots.filter((sl) => sl.sets > 0).map((sl) => prescribe(sl.exercise, input.goal, sl.sets)),
    })),
  };
}
