import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SecondaryButton, SectionLabel } from "@/components/ui";
import { lookbackDate } from "@/lib/checkin/logic";
import type { CheckinRow } from "@/lib/checkin/save";
import Link from "next/link";
import { EQUIPMENT_SETUPS, EXPERIENCES, type EquipmentSetup, type Experience } from "@/lib/engine/types";
import { getExercise } from "@/lib/exercises/library";
import { loadOrCreateProgram } from "@/lib/program/supabase";
import type { TodaySession } from "@/lib/session/todayDay";
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
    .select("session_minutes, experience, equipment, days_per_week")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");
  const experience = profile.experience as Experience;
  const equipment = profile.equipment as EquipmentSetup;
  if (!EXPERIENCES.includes(experience) || !EQUIPMENT_SETUPS.includes(equipment)) redirect("/onboarding");
  const { program, rotationResetAt } = await loadOrCreateProgram(supabase, user.id, { experience, equipment, daysPerWeek: profile.days_per_week });

  // The user's local "today" is within a day of the UTC date, so fetch that window and let the
  // device pick the row that matches its own date.
  const since = lookbackDate(new Date());
  const { data: recent } = await supabase
    .from("checkins")
    .select("checkin_date, sleep_hours, energy, soreness, pain_areas, minutes_available, note, readiness_level, readiness_reasons")
    .eq("user_id", user.id)
    .gte("checkin_date", since);
  // The latest few sessions cover today (whatever the device's date) and the last one before it.
  const { data: sessions } = await supabase
    .from("sessions")
    .select("session_date, day_index, day_name, build_count, updated_at")
    .eq("user_id", user.id)
    .order("session_date", { ascending: false })
    .limit(4);

  return (
    <main className="flex flex-1 flex-col px-7 pt-10 pb-10">
      <CheckinScreen
        sessionMinutes={profile.session_minutes}
        recent={(recent ?? []) as CheckinRow[]}
        sessions={(sessions ?? []) as TodaySession[]}
        program={{
          name: program.name,
          days: program.days.map((d) => ({ name: d.name, exercises: d.exercises.map((e) => getExercise(e.exerciseId).name) })),
        }}
        rotationResetAt={rotationResetAt}
      />

      <section className="mt-10 flex flex-col gap-3 border-t border-hairline pt-7">
        <SectionLabel>Program</SectionLabel>
        <Link href="/program" className="flex min-h-11 items-center justify-between gap-4 rounded-row border border-hairline px-5 py-4 text-ink">
          <span className="flex flex-col gap-1">
            <span className="font-serif text-[24px] leading-[1.1]">{program.name}</span>
            <span className="label-mono">
              {profile.days_per_week} days a week · {program.days.length}-day rotation
            </span>
          </span>
          <span aria-hidden="true" className="text-muted">→</span>
          <span className="sr-only">Change your program</span>
        </Link>
      </section>

      <section className="mt-7 flex flex-col gap-3 border-t border-hairline py-7">
        <SectionLabel>Appearance</SectionLabel>
        <ThemeToggle />
      </section>

      <form action={signOut} className="pt-2">
        <SecondaryButton type="submit">Log out</SecondaryButton>
      </form>
    </main>
  );
}
