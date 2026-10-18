/** One row of `set_logs` (see supabase/migrations/0006_set_logs.sql), as the phone sends it. */
export type LoggedSetRow = {
  /** Made on the phone when the set is logged, so retries never save it twice. */
  id: string;
  session_id: string;
  exercise_id: string;
  set_number: number;
  /** Null for bodyweight exercises. */
  weight_kg: number | null;
  reps: number;
  /** 0–4; 4 means "4 or more". */
  rir: number;
  logged_at: string;
};
