"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CheckinForm } from "@/lib/checkin/logic";
import { saveCheckinForUser, type CheckinStore, type SaveResult } from "@/lib/checkin/save";

export async function saveCheckin(input: { date: string; form: CheckinForm }): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await saveCheckinForUser(supabase as unknown as CheckinStore, user.id, input);
  if ("saved" in result) revalidatePath("/today");
  return result;
}
