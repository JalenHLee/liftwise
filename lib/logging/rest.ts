/** A running rest: when it ends, how long it is, and what's next. */
export type Rest = { startedAt: number; seconds: number; next: string };

/** How long "Rest done" stays on screen before the bar closes. */
export const REST_DONE_MS = 5_000;

/** Seconds left (rounded up), counted from timestamps so a locked phone doesn't pause it. */
export function restLeft(rest: Rest, now: number): number {
  return Math.max(0, Math.ceil((rest.startedAt + rest.seconds * 1000 - now) / 1000));
}

/** "1:42" */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** True once the rest is over and "Rest done" has been shown long enough. */
export const restExpired = (rest: Rest, now: number) => now >= rest.startedAt + rest.seconds * 1000 + REST_DONE_MS;

export const startRest = (seconds: number, next: string): Rest => ({ startedAt: Date.now(), seconds, next });
