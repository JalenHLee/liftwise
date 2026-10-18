import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlausibleLocalDate } from "@/lib/checkin/logic";
import { buildsLeft, checkinChangedSince } from "@/lib/session/save";
import type { LoggedSetRow } from "@/lib/logging/types";
import type { SessionPlan } from "@/lib/session/types";
import { SessionView } from "./SessionView";

// Claude has 15 seconds; leave room for the database around it.
export const maxDuration = 30;

export default async function SessionPage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  const { date } = await searchParams;
  if (typeof date !== "string" || !isPlausibleLocalDate(date, new Date())) redirect("/today");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: session }, { data: checkin }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, plan, build_count, checkin_updated_at, completed_at, rating, note, skipped_exercise_ids")
      .eq("user_id", user.id)
      .eq("session_date", date)
      .maybeSingle(),
    supabase.from("checkins").select("updated_at").eq("user_id", user.id).eq("checkin_date", date).maybeSingle(),
  ]);
  if (!session) redirect("/today");

  const { data: sets } = await supabase
    .from("set_logs")
    .select("id, session_id, exercise_id, set_number, weight_kg, reps, rir, logged_at")
    .eq("session_id", session.id)
    .order("set_number");

  return (
    <main className="flex flex-1 flex-col px-7 pt-10 pb-10">
      <SessionView
        date={date}
        sessionId={session.id}
        serverSets={((sets ?? []) as LoggedSetRow[]).map((s) => ({ ...s, weight_kg: s.weight_kg === null ? null : Number(s.weight_kg) }))}
        serverSkips={session.skipped_exercise_ids ?? []}
        completed={session.completed_at ? { at: session.completed_at, rating: session.rating, note: session.note } : null}
        plan={session.plan as SessionPlan}
        buildsLeft={buildsLeft(session.build_count)}
        checkinChanged={checkinChangedSince(session.checkin_updated_at, checkin?.updated_at)}
      />
    </main>
  );
}
