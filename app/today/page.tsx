import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SecondaryButton, SectionLabel } from "@/components/ui";
import { lookbackDate } from "@/lib/checkin/logic";
import type { CheckinRow } from "@/lib/checkin/save";
import { CheckinScreen } from "./CheckinScreen";

// Building a session calls Claude (15-second limit); leave room for the database around it.
export const maxDuration = 30;

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("session_minutes")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  // The user's local "today" is within a day of the UTC date, so fetch that window and let the
  // device pick the row that matches its own date.
  const since = lookbackDate(new Date());
  const { data: recent } = await supabase
    .from("checkins")
    .select("checkin_date, sleep_hours, energy, soreness, pain_areas, minutes_available, note, readiness_level, readiness_reasons")
    .eq("user_id", user.id)
    .gte("checkin_date", since);
  const { data: sessions } = await supabase
    .from("sessions")
    .select("session_date")
    .eq("user_id", user.id)
    .gte("session_date", since);

  return (
    <main className="flex flex-1 flex-col px-7 pt-10 pb-10">
      <CheckinScreen
        sessionMinutes={profile.session_minutes}
        recent={(recent ?? []) as CheckinRow[]}
        sessionDates={(sessions ?? []).map((s) => s.session_date)}
      />

      <section className="mt-10 flex flex-col gap-3 border-t border-hairline py-7">
        <SectionLabel>Appearance</SectionLabel>
        <ThemeToggle />
      </section>

      <form action={signOut} className="pt-2">
        <SecondaryButton type="submit">Log out</SecondaryButton>
      </form>
    </main>
  );
}
