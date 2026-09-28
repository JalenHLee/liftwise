import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveRoute } from "@/lib/routing/resolveRoute";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hasProfile = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    hasProfile = Boolean(profile);
  }

  redirect(resolveRoute({ hasSession: Boolean(user), hasProfile }));
}
