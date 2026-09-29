import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Wordmark } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <main className="flex flex-1 flex-col px-7 pt-10 pb-10">
      <span className="label-mono">Daily training</span>
      <div className="mt-[14vh]">
        <h1>
          <Wordmark className="text-[76px]" />
        </h1>
        <p className="mt-4 text-base text-muted">Your workout, adjusted to today.</p>
      </div>
      <div className="mt-auto pt-16">
        <LoginForm />
      </div>
    </main>
  );
}
