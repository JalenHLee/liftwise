"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { anthropicClient } from "@/lib/session/ai";
import { buildSessionForUser, type BuildResult } from "@/lib/session/save";
import { supabaseSessionStore } from "@/lib/session/supabaseStore";

/** Builds (or rebuilds) today's session. Claude is only ever called from here, on the server. */
export async function buildSession(input: { date: string }): Promise<BuildResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const ai = apiKey ? anthropicClient(apiKey) : null;

  const result = await buildSessionForUser(supabaseSessionStore(supabase), user.id, input.date, ai);
  if ("built" in result) {
    revalidatePath("/today");
    revalidatePath("/session");
  }
  return result;
}
