import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Wordmark } from "@/components/ui";
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
    <main className="flex flex-1 flex-col px-7 pt-10">
      <div className="flex items-baseline justify-between">
        <Wordmark className="text-[26px]" />
        <span className="label-mono">Setup</span>
      </div>
      <div className="mt-14 mb-10">
        <h1 className="font-serif text-[44px] leading-[1.05] text-ink">
          Let&apos;s set up your <em>training</em>.
        </h1>
        <p className="mt-4 text-base text-muted">Takes about a minute. You can change any of this later.</p>
      </div>
      <OnboardingForm />
    </main>
  );
}
