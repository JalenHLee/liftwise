import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EQUIPMENT_SETUPS, EXPERIENCES, type EquipmentSetup, type Experience } from "@/lib/engine/types";
import { getExercise } from "@/lib/exercises/library";
import { loadOrCreateProgram } from "@/lib/program/supabase";
import { ProgramScreen } from "./ProgramScreen";

export default async function ProgramPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("experience, equipment, days_per_week").eq("user_id", user.id).maybeSingle();
  if (!profile) redirect("/onboarding");
  const experience = profile.experience as Experience;
  const equipment = profile.equipment as EquipmentSetup;
  if (!EXPERIENCES.includes(experience) || !EQUIPMENT_SETUPS.includes(equipment)) redirect("/onboarding");

  const { program } = await loadOrCreateProgram(supabase, user.id, { experience, equipment, daysPerWeek: profile.days_per_week });

  return (
    <main className="flex flex-1 flex-col px-7 pt-10 pb-10">
      <ProgramScreen
        experience={experience}
        equipment={equipment}
        daysPerWeek={profile.days_per_week}
        program={{
          name: program.name,
          split: program.split,
          days: program.days.map((d) => ({ name: d.name, exercises: d.exercises.map((e) => getExercise(e.exerciseId).name) })),
        }}
      />
    </main>
  );
}
