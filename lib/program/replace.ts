import { isSplitAllowed } from "@/lib/engine/templates";
import { EQUIPMENT_SETUPS, EXPERIENCES, type EquipmentSetup, type Experience } from "@/lib/engine/types";
import { DAYS_PER_WEEK_OPTIONS } from "@/lib/onboarding/validation";
import { generateProgram, type ProgramRow } from "./program";

export type ReplaceRequest = { daysPerWeek: number; split: string };

/** The database calls replacing a program needs, so tests can stand in for Supabase. */
export type ReplaceStore = {
  loadProfile(userId: string): Promise<{ experience: string; equipment: string } | null>;
  saveDaysPerWeek(userId: string, daysPerWeek: number): Promise<{ error: string | null }>;
  saveProgram(userId: string, row: ProgramRow): Promise<{ error: string | null }>;
};

/**
 * Replaces the user's program with a freshly generated one for the chosen days per week and
 * split, and restarts the rotation at day 1 (decision 24). A session already built today stays
 * as it is until the user rebuilds it.
 */
export async function replaceProgramForUser(
  store: ReplaceStore,
  userId: string,
  request: ReplaceRequest,
  now: Date = new Date(),
): Promise<{ ok: true } | { error: string }> {
  if (!(DAYS_PER_WEEK_OPTIONS as readonly number[]).includes(request.daysPerWeek)) return { error: "Choose 2 to 6 days a week." };
  if (!isSplitAllowed(request.split, request.daysPerWeek)) return { error: "That split isn't available for that many days." };

  const profile = await store.loadProfile(userId);
  if (!profile || !(EXPERIENCES as readonly string[]).includes(profile.experience) || !(EQUIPMENT_SETUPS as readonly string[]).includes(profile.equipment)) {
    return { error: "Finish onboarding first." };
  }

  const program = generateProgram(request.split, {
    daysPerWeek: request.daysPerWeek,
    experience: profile.experience as Experience,
    equipment: profile.equipment as EquipmentSetup,
  });
  const days = await store.saveDaysPerWeek(userId, request.daysPerWeek);
  if (days.error) return { error: days.error };
  const saved = await store.saveProgram(userId, { ...program, rotation_reset_at: now.toISOString() });
  if (saved.error) return { error: saved.error };
  return { ok: true };
}
