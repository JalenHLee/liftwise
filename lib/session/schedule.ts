import { checkDeload, DELOAD_EVERY_WEEKS } from "@/lib/engine/deload";
import type { Readiness } from "@/lib/engine/types";

/** ISO date (YYYY-MM-DD) -> whole days since 1970, ignoring time zones. */
export const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/**
 * Which day of the program to train. Days rotate in order (not by weekday):
 * the day after the last session built before today, wrapping round.
 * Rebuilding today keeps today's day.
 */
export function pickDayIndex(input: {
  dayCount: number;
  todaysDayIndex?: number | null;
  lastDayIndexBeforeToday?: number | null;
}): number {
  const { dayCount, todaysDayIndex, lastDayIndexBeforeToday } = input;
  if (todaysDayIndex != null) return todaysDayIndex % dayCount;
  if (lastDayIndexBeforeToday == null) return 0;
  return (lastDayIndexBeforeToday + 1) % dayCount;
}

export type RotationSession = { session_date: string; day_index: number; updated_at: string };

/**
 * Where today sits in the rotation. Only sessions built since the program was last replaced
 * count (decision 24: a new program starts at day 1). `todaysDayIndex` is today's built day,
 * when it counts; `dayIndex` is the day to build (today's day for a rebuild, else the next one).
 */
export function rotationFor(input: {
  sessions: RotationSession[];
  today: string;
  dayCount: number;
  rotationResetAt: string | null;
}): { dayIndex: number; todaysDayIndex: number | null } {
  const reset = input.rotationResetAt ? Date.parse(input.rotationResetAt) : null;
  const counted = input.sessions.filter((s) => reset === null || Date.parse(s.updated_at) >= reset);
  const today = dayNumber(input.today);
  const todays = counted.find((s) => dayNumber(s.session_date) === today);
  const last = counted.filter((s) => dayNumber(s.session_date) < today).sort((a, b) => dayNumber(b.session_date) - dayNumber(a.session_date))[0];
  const todaysDayIndex = todays ? todays.day_index % input.dayCount : null;
  return {
    dayIndex: pickDayIndex({ dayCount: input.dayCount, todaysDayIndex, lastDayIndexBeforeToday: last?.day_index }),
    todaysDayIndex,
  };
}

export type DeloadHistory = {
  today: string;
  /** Dates of earlier sessions (before today). */
  sessionDates: string[];
  /** Dates of earlier sessions that were deloads. */
  deloadDates: string[];
  /** Check-ins from the last 7 days, today included. */
  checkIns: { date: string; level: Readiness }[];
};

/**
 * Deload decision for today. "Every 6th week" counts from the start of the last deload
 * week (decision 12) or, if there has never been one, from the first session.
 * A deload lasts a week, so the 7 days from its start stay deload days.
 * The stalled-lifts trigger needs logged sets, so it starts working in slice 6.
 */
export function deloadToday(h: DeloadHistory): { deload: boolean; reasons: string[] } {
  const today = dayNumber(h.today);
  const deloads = h.deloadDates.map(dayNumber).filter((d) => d < today).sort((a, b) => a - b);

  let weekSinceLastDeload: number;
  if (deloads.length) {
    // The start of the latest deload week: walk back while earlier deload days are within that week.
    const latest = deloads[deloads.length - 1];
    const start = Math.min(...deloads.filter((d) => d > latest - 7));
    if (today - start < 7) return { deload: true, reasons: ["Deload week continues"] };
    weekSinceLastDeload = Math.floor((today - start) / 7);
  } else {
    const first = Math.min(today, ...h.sessionDates.map(dayNumber));
    weekSinceLastDeload = Math.floor((today - first) / 7) + 1;
  }

  return checkDeload({
    weekSinceLastDeload: Math.min(weekSinceLastDeload, DELOAD_EVERY_WEEKS),
    weeklyBests: {},
    checkIns: h.checkIns,
    today: h.today,
  });
}
