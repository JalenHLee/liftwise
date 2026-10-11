import { beats, type WeeklyBest } from "./deload";
import type { LoggedSession } from "./progression";

/** One logged set, with the session it belongs to. Whether the session was finished doesn't matter. */
export type SetLog = {
  exerciseId: string;
  /** The session's local date (YYYY-MM-DD, the user's own calendar). */
  sessionDate: string;
  /** Deload sessions are deliberately easy, so progression and stall checks skip them. */
  isDeload: boolean;
  setNumber: number;
  /** Null for bodyweight exercises. */
  weightKg: number | null;
  reps: number;
  rir: number;
  loggedAt: string;
};

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** Day number of the Monday that starts this date's week (weeks run Monday–Sunday). */
export const weekStart = (iso: string) => {
  const d = dayNumber(iso);
  // Day 0 (1970-01-01) was a Thursday, 3 days after a Monday.
  return d - ((((d + 3) % 7) + 7) % 7);
};

const bySetOrder = (a: SetLog, b: SetLog) => a.setNumber - b.setNumber || Date.parse(a.loggedAt) - Date.parse(b.loggedAt);

/**
 * One exercise's logged sessions for double progression, oldest first. The working weight is
 * the first set's weight; each set keeps its own weight so lighter sets can't count as a top hit.
 */
export function exerciseHistory(logs: SetLog[], exerciseId: string): LoggedSession[] {
  const byDate = new Map<string, SetLog[]>();
  for (const log of logs) {
    if (log.exerciseId !== exerciseId || log.isDeload) continue;
    byDate.set(log.sessionDate, [...(byDate.get(log.sessionDate) ?? []), log]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => dayNumber(a) - dayNumber(b))
    .map(([, sets]) => {
      const ordered = [...sets].sort(bySetOrder);
      return {
        loadKg: ordered[0].weightKg ?? 0,
        sets: ordered.map((s) => ({ reps: s.reps, rir: s.rir, loadKg: s.weightKg ?? 0 })),
      };
    });
}

/** Every logged exercise's history, keyed by exercise id. */
export function historyByExercise(logs: SetLog[]): Record<string, LoggedSession[]> {
  const ids = [...new Set(logs.map((l) => l.exerciseId))];
  return Object.fromEntries(ids.map((id) => [id, exerciseHistory(logs, id)]).filter(([, h]) => h.length > 0));
}

/**
 * Best set (heaviest, then most reps) per exercise per week, oldest week first, for the stall
 * check. Only finished weeks count (the current week is still in progress), weeks without the
 * lift are left out rather than counted as a stall, and deload sessions are ignored.
 */
export function weeklyBests(logs: SetLog[], today: string): Record<string, WeeklyBest[]> {
  const thisWeek = weekStart(today);
  const best = new Map<string, Map<number, WeeklyBest>>();
  for (const log of logs) {
    const week = weekStart(log.sessionDate);
    if (log.isDeload || week >= thisWeek) continue;
    const set = { loadKg: log.weightKg ?? 0, reps: log.reps };
    const weeks = best.get(log.exerciseId) ?? new Map<number, WeeklyBest>();
    const current = weeks.get(week);
    if (!current || beats(set, current)) weeks.set(week, set);
    best.set(log.exerciseId, weeks);
  }
  return Object.fromEntries(
    [...best.entries()].map(([id, weeks]) => [id, [...weeks.entries()].sort(([a], [b]) => a - b).map(([, b]) => b)]),
  );
}
