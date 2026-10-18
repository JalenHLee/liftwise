import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncSender } from "./queue";

/**
 * Sends queued changes straight to Supabase from the phone. Row Level Security limits every
 * write to the user's own sets and sessions. Any error throws, so the change stays queued.
 */
export function supabaseSender(supabase: SupabaseClient): SyncSender {
  return async (op) => {
    let result;
    if (op.kind === "upsert") {
      result = await supabase.from("set_logs").upsert({ ...op.set, updated_at: new Date().toISOString() }, { onConflict: "id" });
    } else if (op.kind === "delete") {
      result = await supabase.from("set_logs").delete().eq("id", op.id);
    } else {
      result = await supabase.from("sessions").update({ skipped_exercise_ids: op.exerciseIds }).eq("id", op.sessionId);
    }
    if (result.error) throw new Error(result.error.message);
  };
}
