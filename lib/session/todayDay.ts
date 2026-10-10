import { rotationFor, type RotationSession } from "./schedule";

export type TodaySession = RotationSession & { day_name: string; build_count: number };

export type TodayDay = {
  /** The day to show: today's built day, the user's pick, or the next in the rotation. */
  dayIndex: number | null;
  dayName: string;
  status: "next" | "picked" | "built" | "built_old_program";
  /** The next day in the rotation (what "Build my session" uses unless the user picks another). */
  nextIndex: number;
  /** Today's built session, if any. */
  built: TodaySession | null;
};

/** What the Today screen says about today's program day. */
export function todayDay(input: {
  sessions: TodaySession[];
  today: string;
  dayNames: string[];
  rotationResetAt: string | null;
  picked: number | null;
}): TodayDay {
  const rotation = rotationFor({ sessions: input.sessions, today: input.today, dayCount: input.dayNames.length, rotationResetAt: input.rotationResetAt });
  const built = input.sessions.find((s) => s.session_date === input.today) ?? null;
  const base = { nextIndex: rotation.dayIndex, built };
  if (built) {
    // Built before the program was replaced: its day isn't one of the new program's days.
    if (rotation.todaysDayIndex === null) return { ...base, dayIndex: null, dayName: built.day_name, status: "built_old_program" };
    return { ...base, dayIndex: rotation.todaysDayIndex, dayName: input.dayNames[rotation.todaysDayIndex], status: "built" };
  }
  const index = input.picked ?? rotation.dayIndex;
  return { ...base, dayIndex: index, dayName: input.dayNames[index], status: index === rotation.dayIndex ? "next" : "picked" };
}
