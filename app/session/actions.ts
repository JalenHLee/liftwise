"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlausibleLocalDate } from "@/lib/checkin/logic";
import { canResume, validateFinish } from "@/lib/logging/sets";
import { anthropicClient } from "@/lib/session/ai";
import { buildSessionForUser, type BuildRequest, type BuildResult } from "@/lib/session/save";
import { supabaseSessionStore } from "@/lib/session/supabaseStore";

/**
 * Builds (or rebuilds) today's session, optionally on a program day the user picked.
 * Claude is only ever called from here, on the server.
 */
export async function buildSession(input: BuildRequest): Promise<BuildResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const ai = apiKey ? anthropicClient(apiKey) : null;

  const result = await buildSessionForUser(supabaseSessionStore(supabase), user.id, { date: input.date, dayIndex: input.dayIndex }, ai);
  if ("built" in result) {
    revalidatePath("/today");
    revalidatePath("/session");
  }
  return result;
}

export type SessionActionResult = { ok: true } | { error: string };

/** Marks the session finished with the "How did it go?" rating and note. Partial sessions are fine. */
export async function finishSession(input: { sessionId: string; rating: number; note: string }): Promise<SessionActionResult> {
  const valid = validateFinish(input);
  if ("error" in valid) return valid;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("sessions")
    .update({ completed_at: new Date().toISOString(), rating: valid.rating, note: valid.note })
    .eq("id", input.sessionId)
    .eq("user_id", user.id)
    .select("id");
  if (error) return { error: "Couldn't save that. Please try again." };
  if (!data?.length) return { error: "That session wasn't found. Please refresh." };
  revalidatePath("/session");
  revalidatePath("/today");
  return { ok: true };
}

/** Reopens a finished session for more logging, only on its own local day. */
export async function resumeSession(input: { sessionId: string; date: string }): Promise<SessionActionResult> {
  if (!isPlausibleLocalDate(input.date, new Date())) return { error: "That date doesn't look right. Please refresh and try again." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: session } = await supabase.from("sessions").select("session_date").eq("id", input.sessionId).eq("user_id", user.id).maybeSingle();
  if (!session) return { error: "That session wasn't found. Please refresh." };
  if (!canResume(session.session_date, input.date)) return { error: "Only today's workout can be resumed." };

  const { error } = await supabase.from("sessions").update({ completed_at: null }).eq("id", input.sessionId).eq("user_id", user.id);
  if (error) return { error: "Couldn't reopen it. Please try again." };
  revalidatePath("/session");
  revalidatePath("/today");
  return { ok: true };
}
