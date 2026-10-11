import { EQUIPMENT_SETUPS, EXPERIENCES, GOALS } from "@/lib/engine/types";
import type { EquipmentSetup, Experience, Goal } from "@/lib/engine/types";
import { weightedKeyLiftsFor } from "@/lib/onboarding/keyLifts";
import { isSplitAllowed } from "@/lib/engine/templates";

export const SESSION_MINUTES_OPTIONS = [30, 45, 60, 75, 90] as const;
export const DAYS_PER_WEEK_OPTIONS = [2, 3, 4, 5, 6] as const;

export const MIN_STARTING_REPS = 1;
export const MAX_STARTING_REPS = 12;
/** Above this, the 1-rep-max estimate gets noticeably less precise. */
export const PRECISE_STARTING_REPS = 10;

export type StartingSet = { weightKg: number; reps: number };

export type OnboardingInput = {
  firstName: string;
  goal: string;
  daysPerWeek: number;
  /** The program split, one of those offered for `daysPerWeek`. */
  split: string;
  sessionMinutes: number;
  equipment: string;
  experience: string;
  /** exerciseId -> last solid set, only for lifts the user chose to fill in */
  startingWeights: Record<string, StartingSet>;
};

export type OnboardingErrors = Partial<Record<keyof OnboardingInput, string>> & { form?: string };

export function validateOnboarding(input: OnboardingInput): OnboardingErrors {
  const errors: OnboardingErrors = {};

  if (input.firstName.trim().length === 0) {
    errors.firstName = "Enter your first name.";
  } else if (input.firstName.trim().length > 60) {
    errors.firstName = "First name is too long.";
  }

  if (!GOALS.includes(input.goal as Goal)) {
    errors.goal = "Choose a goal.";
  }

  if (!DAYS_PER_WEEK_OPTIONS.includes(input.daysPerWeek as (typeof DAYS_PER_WEEK_OPTIONS)[number])) {
    errors.daysPerWeek = "Choose 2 to 6 days a week.";
  } else if (!isSplitAllowed(input.split, input.daysPerWeek)) {
    errors.split = "Choose a split.";
  }

  if (!SESSION_MINUTES_OPTIONS.includes(input.sessionMinutes as (typeof SESSION_MINUTES_OPTIONS)[number])) {
    errors.sessionMinutes = "Choose a session length.";
  }

  if (!EQUIPMENT_SETUPS.includes(input.equipment as EquipmentSetup)) {
    errors.equipment = "Choose your equipment.";
  }

  if (!EXPERIENCES.includes(input.experience as Experience)) {
    errors.experience = "Choose your experience level.";
  }

  if (!errors.equipment) {
    const allowedIds = new Set(weightedKeyLiftsFor(input.equipment as EquipmentSetup).map((e) => e.id));
    for (const [exerciseId, set] of Object.entries(input.startingWeights)) {
      if (!allowedIds.has(exerciseId)) {
        errors.startingWeights = "One of those lifts isn't available with your equipment.";
        break;
      }
      if (!Number.isFinite(set.weightKg) || set.weightKg <= 0) {
        errors.startingWeights = "Weights must be a positive number.";
        break;
      }
      if (!Number.isInteger(set.reps) || set.reps < MIN_STARTING_REPS || set.reps > MAX_STARTING_REPS) {
        errors.startingWeights = `Reps must be a whole number from ${MIN_STARTING_REPS} to ${MAX_STARTING_REPS}.`;
        break;
      }
    }
  }

  return errors;
}

/** What the user has typed for one lift, before it is checked. */
export type StartingSetDraft = { weight: string; reps: string };

/**
 * Turns the typed drafts into starting sets. A lift with both boxes empty
 * is skipped; a lift with only one box filled is an error.
 */
export function parseStartingSets(drafts: Record<string, StartingSetDraft>): {
  sets: Record<string, StartingSet>;
  error?: string;
} {
  const sets: Record<string, StartingSet> = {};
  for (const [exerciseId, draft] of Object.entries(drafts)) {
    const weight = draft.weight.trim();
    const reps = draft.reps.trim();
    if (weight === "" && reps === "") continue;
    if (weight === "" || reps === "") {
      return { sets: {}, error: "Add both weight and reps, or leave both empty." };
    }
    sets[exerciseId] = { weightKg: Number(weight.replace(",", ".")), reps: Number(reps) };
  }
  return { sets };
}

export function isValid(errors: OnboardingErrors): boolean {
  return Object.keys(errors).length === 0;
}
