import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";

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
    <main className="flex flex-1 flex-col px-6 py-10">
      <div className="flex-1">
        <p className="text-muted">Welcome back,</p>
        <h1 className="text-4xl font-bold tracking-tight">{profile.first_name}</h1>
        <p className="mt-2 text-muted">
          Goal: <span className="text-foreground">{GOAL_LABELS[profile.goal] ?? profile.goal}</span>
        </p>
        <p className="mt-6 text-sm text-muted">Today&apos;s check-in is coming soon.</p>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="w-full rounded-2xl border border-border bg-surface py-4 text-base font-semibold text-foreground"
        >
          Log out
        </button>
      </form>
    </main>
  );
}
