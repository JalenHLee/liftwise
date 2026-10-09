import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlausibleLocalDate } from "@/lib/checkin/logic";
import { buildsLeft, checkinChangedSince } from "@/lib/session/save";
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
    supabase.from("sessions").select("plan, build_count, checkin_updated_at").eq("user_id", user.id).eq("session_date", date).maybeSingle(),
    supabase.from("checkins").select("updated_at").eq("user_id", user.id).eq("checkin_date", date).maybeSingle(),
  ]);
  if (!session) redirect("/today");

  return (
    <main className="flex flex-1 flex-col px-7 pt-10 pb-10">
      <SessionView
        date={date}
        plan={session.plan as SessionPlan}
        buildsLeft={buildsLeft(session.build_count)}
        checkinChanged={checkinChangedSince(session.checkin_updated_at, checkin?.updated_at)}
      />
    </main>
  );
}
