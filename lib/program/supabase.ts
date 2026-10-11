import type { createClient } from "@/lib/supabase/server";
import { resolveProgram, type ProgramProfile, type ProgramRow } from "./program";
import type { Program } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const PROGRAM_COLUMNS = "name, source, split, days, rotation_reset_at";

/** Inserts or replaces the user's one active program (Row Level Security limits it to the user). */
export async function saveProgramRow(supabase: Supabase, userId: string, row: ProgramRow): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("programs")
    .upsert({ user_id: userId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return { error: error?.message ?? null };
}

/** The user's stored program, created from their recommended template the first time it's needed. */
export async function loadOrCreateProgram(
  supabase: Supabase,
  userId: string,
  profile: ProgramProfile,
): Promise<{ program: Program; rotationResetAt: string | null }> {
  const { data } = await supabase.from("programs").select(PROGRAM_COLUMNS).eq("user_id", userId).maybeSingle();
  const resolved = resolveProgram(data as ProgramRow | null, profile);
  if (resolved.needsSave) {
    const p = resolved.program;
    await saveProgramRow(supabase, userId, { name: p.name, source: p.source, split: p.split, days: p.days, rotation_reset_at: resolved.rotationResetAt });
  }
  return { program: resolved.program, rotationResetAt: resolved.rotationResetAt };
}
