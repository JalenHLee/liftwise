import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile) redirect("/today");

  return (
    <main className="flex flex-1 flex-col px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Let&apos;s set up your training</h1>
        <p className="mt-2 text-muted">Takes about a minute. You can change any of this later.</p>
      </div>
      <OnboardingForm />
    </main>
  );
}
