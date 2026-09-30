"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValid, validateOnboarding, type OnboardingErrors, type OnboardingInput } from "@/lib/onboarding/validation";

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

  redirect("/today");
}
