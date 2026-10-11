"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValid, validateOnboarding, type OnboardingErrors, type OnboardingInput } from "@/lib/onboarding/validation";
import type { SplitId } from "@/lib/engine/templates";
import type { EquipmentSetup, Experience } from "@/lib/engine/types";
import { generateProgram } from "@/lib/program/program";
import { saveProgramRow } from "@/lib/program/supabase";

export async function saveOnboarding(input: OnboardingInput): Promise<{ errors: OnboardingErrors }> {
  const errors = validateOnboarding(input);
  if (!isValid(errors)) {
    return { errors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Upsert (rather than insert) so a future "edit profile" screen can call
  // this same action to update an existing profile.
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      first_name: input.firstName.trim(),
      goal: input.goal,
      days_per_week: input.daysPerWeek,
      session_minutes: input.sessionMinutes,
      equipment: input.equipment,
      experience: input.experience,
    },
    { onConflict: "user_id" },
  );

  if (profileError) {
    return { errors: { form: profileError.message } };
  }

  const weightRows = Object.entries(input.startingWeights).map(([exerciseId, set]) => ({
    user_id: user.id,
    exercise_id: exerciseId,
    weight_kg: set.weightKg,
    reps: set.reps,
  }));

  if (weightRows.length > 0) {
    const { error: weightsError } = await supabase
      .from("starting_weights")
      .upsert(weightRows, { onConflict: "user_id,exercise_id" });

    if (weightsError) {
      return { errors: { form: weightsError.message } };
    }
  }

  // The user's program, generated from the split they chose.
  const program = generateProgram(input.split as SplitId, {
    daysPerWeek: input.daysPerWeek,
    experience: input.experience as Experience,
    equipment: input.equipment as EquipmentSetup,
  });
  const { error: programError } = await saveProgramRow(supabase, user.id, { ...program, rotation_reset_at: null });
  if (programError) {
    return { errors: { form: programError } };
  }

  redirect("/today");
}
