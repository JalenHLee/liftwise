import { EQUIPMENT_SETUPS, EXPERIENCES, GOALS } from "@/lib/engine/types";
import type { EquipmentSetup, Experience, Goal } from "@/lib/engine/types";
import { weightedKeyLiftsFor } from "@/lib/onboarding/keyLifts";

export const SESSION_MINUTES_OPTIONS = [30, 45, 60, 75, 90] as const;
export const DAYS_PER_WEEK_OPTIONS = [2, 3, 4, 5, 6] as const;

export type OnboardingInput = {
  firstName: string;
  goal: string;
  daysPerWeek: number;
  sessionMinutes: number;
  equipment: string;
  experience: string;
  /** exerciseId -> kg, only for lifts the user chose to fill in */
  startingWeights: Record<string, number>;
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
    for (const [exerciseId, weight] of Object.entries(input.startingWeights)) {
      if (!allowedIds.has(exerciseId)) {
        errors.startingWeights = "One of those lifts isn't available with your equipment.";
        break;
      }
      if (!Number.isFinite(weight) || weight <= 0) {
        errors.startingWeights = "Starting weights must be a positive number.";
        break;
      }
    }
  }

  return errors;
}

export function isValid(errors: OnboardingErrors): boolean {
  return Object.keys(errors).length === 0;
}
