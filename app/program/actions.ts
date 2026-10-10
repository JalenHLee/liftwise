"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { replaceProgramForUser, type ReplaceRequest } from "@/lib/program/replace";
import { saveProgramRow } from "@/lib/program/supabase";

/** Replaces the user's program (new days per week and/or split); the rotation restarts at day 1. */
export async function replaceProgram(input: ReplaceRequest): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await replaceProgramForUser(
    {
      async loadProfile(userId) {
        const { data } = await supabase.from("profiles").select("experience, equipment").eq("user_id", userId).maybeSingle();
        return data;
      },
      async saveDaysPerWeek(userId, daysPerWeek) {
        const { error } = await supabase
          .from("profiles")
          .update({ days_per_week: daysPerWeek, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
        return { error: error?.message ?? null };
      },
      saveProgram: (userId, row) => saveProgramRow(supabase, userId, row),
    },
    user.id,
    input,
  );
  if ("ok" in result) {
    revalidatePath("/program");
    revalidatePath("/today");
  }
  return result;
}
