import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SecondaryButton, SectionLabel, Wordmark } from "@/components/ui";

const GOAL_LABELS: Record<string, string> = {
  strength: "Strength",
  muscle: "Muscle",
  general: "General fitness",
};

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, goal")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  return (
    <main className="flex flex-1 flex-col px-7 pt-10 pb-10">
      <div className="flex items-baseline justify-between">
        <Wordmark className="text-[26px]" />
        <span className="label-mono">Today</span>
      </div>

      <div className="mt-14 mb-10">
        <p className="text-base text-muted">Welcome back,</p>
        <h1 className="mt-1 font-serif text-[56px] leading-none text-ink">{profile.first_name}</h1>
      </div>

      <section className="flex flex-col gap-2 border-t border-hairline py-7">
        <SectionLabel index={1}>Goal</SectionLabel>
        <p className="font-serif text-[30px] leading-tight">{GOAL_LABELS[profile.goal] ?? profile.goal}</p>
      </section>

      <section className="flex flex-col gap-2 border-t border-hairline py-7">
        <SectionLabel index={2}>Check-in</SectionLabel>
        <p className="text-base text-muted">Today&apos;s check-in is coming soon.</p>
      </section>

      <section className="flex flex-col gap-3 border-t border-hairline py-7">
        <SectionLabel index={3}>Appearance</SectionLabel>
        <ThemeToggle />
      </section>

      <form action={signOut} className="mt-auto pt-6">
        <SecondaryButton type="submit">Log out</SecondaryButton>
      </form>
    </main>
  );
}
