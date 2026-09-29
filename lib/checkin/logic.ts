import { scoreReadiness } from "@/lib/engine/readiness";
import { MUSCLES, PAIN_AREAS, READINESS_LEVELS } from "@/lib/engine/types";
import type { CheckIn, Muscle, PainArea, Readiness } from "@/lib/engine/types";
import { SESSION_MINUTES_OPTIONS } from "@/lib/onboarding/validation";

/** Soreness as the user taps it: 0 = none, then 2..5. Stored as-is except that 0 is left out (the engine reads a missing muscle as 1 = none). */
export const SORENESS_CYCLE = [0, 2, 3, 4, 5] as const;
export type SorenessLevel = (typeof SORENESS_CYCLE)[number];

export const SLEEP_MIN = 0;
export const SLEEP_MAX = 14;
export const SLEEP_STEP = 0.5;
export const ENERGY_OPTIONS = [1, 2, 3, 4, 5] as const;
export const NOTE_MAX_LENGTH = 500;

export type CheckinForm = {
  sleepHours: number;
  energy: number;
  soreness: Partial<Record<Muscle, SorenessLevel>>;
  hasPain: boolean;
  painAreas: PainArea[];
  minutesAvailable: number;
  note: string;
};

export type ReadinessSnapshot = { level: Readiness; tags: string[] };

/** A check-in as saved: the answers plus what the app said that day. */
export type SavedCheckin = {
  /** The user's local date, YYYY-MM-DD. */
  date: string;
  form: CheckinForm;
  readiness: ReadinessSnapshot;
};

export function defaultForm(sessionMinutes: number): CheckinForm {
  return {
    sleepHours: 7,
    energy: 3,
    soreness: {},
    hasPain: false,
    painAreas: [],
    minutesAvailable: sessionMinutes,
    note: "",
  };
}

// ---- Dates -----------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** The date on the user's own clock (not UTC), as YYYY-MM-DD. */
export function localDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateString(value: string): Date | null {
  const m = DATE_PATTERN.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

/**
 * The server can't know the user's time zone, so it only rejects dates that no time zone could
 * be on right now: local dates are always within one day of the UTC date.
 */
export function isPlausibleLocalDate(value: string, now: Date): boolean {
  const date = parseDateString(value);
  if (!date) return false;
  const utcToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.abs(date.getTime() - utcToday) <= 24 * 60 * 60 * 1000;
}

/** The earliest date worth loading to find the user's "today" (two days back covers every time zone). */
export function lookbackDate(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-29" -> "Tue 29 Sep" (shown uppercase in mono). */
export function formatDateLabel(value: string): string {
  const date = parseDateString(value);
  if (!date) return value;
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

// ---- Inputs ----------------------------------------------------------------

/** Each tap moves a muscle 0 -> 2 -> 3 -> 4 -> 5 -> back to 0. */
export function nextSoreness(level: SorenessLevel | undefined): SorenessLevel {
  const i = SORENESS_CYCLE.indexOf(level ?? 0);
  return SORENESS_CYCLE[(i + 1) % SORENESS_CYCLE.length];
}

/** Sleep moves in half-hour steps and stays within the allowed range. */
export function stepSleep(hours: number, direction: 1 | -1): number {
  return Math.min(SLEEP_MAX, Math.max(SLEEP_MIN, hours + direction * SLEEP_STEP));
}

export function formatSleep(hours: number): string {
  return Number.isInteger(hours) ? `${hours}.0` : hours.toFixed(1);
}

export function togglePainArea(areas: PainArea[], area: PainArea): PainArea[] {
  return areas.includes(area) ? areas.filter((a) => a !== area) : PAIN_AREAS.filter((a) => a === area || areas.includes(a));
}

// ---- Readiness -------------------------------------------------------------

/** Turns the form into the engine's own check-in shape (untouched muscles are simply missing = 1). */
export function toEngineCheckIn(form: CheckinForm): CheckIn {
  const soreness: CheckIn["soreness"] = {};
  for (const m of MUSCLES) {
    const level = form.soreness[m] ?? 0;
    if (level > 0) soreness[m] = level;
  }
  return {
    sleepHours: form.sleepHours,
    energy: form.energy,
    soreness,
    painAreas: form.hasPain ? form.painAreas : [],
    minutesAvailable: form.minutesAvailable,
  };
}

/** Scores the form with the engine; the tags are what gets saved as the snapshot. */
export function snapshotReadiness(form: CheckinForm): ReadinessSnapshot {
  const { level, tags } = scoreReadiness(toEngineCheckIn(form));
  return { level, tags };
}

export const READINESS_COPY: Record<Readiness, { label: string; line: string }> = {
  green: { label: "Green day", line: "Plan as written. Weight can go up today." },
  yellow: { label: "Yellow day", line: "A lighter day: one fewer set per exercise, easier effort, no weight increases." },
  red: { label: "Red day", line: "A recovery day: about half the sets, and the weight stays where it is." },
};

export type ReadinessDisplay = ReadinessSnapshot & { label: string; line: string };

export function readinessDisplay(snapshot: ReadinessSnapshot): ReadinessDisplay {
  return { ...snapshot, ...READINESS_COPY[snapshot.level] };
}

// ---- Validation ------------------------------------------------------------

export type CheckinErrors = Partial<Record<keyof CheckinForm | "date" | "form", string>>;

export function validateCheckin(form: CheckinForm): CheckinErrors {
  const errors: CheckinErrors = {};

  const halfSteps = form.sleepHours * 2;
  if (!Number.isFinite(halfSteps) || !Number.isInteger(halfSteps) || form.sleepHours < SLEEP_MIN || form.sleepHours > SLEEP_MAX) {
    errors.sleepHours = "Sleep must be between 0 and 14 hours, in half-hour steps.";
  }

  if (!(ENERGY_OPTIONS as readonly number[]).includes(form.energy)) {
    errors.energy = "Choose your energy from 1 to 5.";
  }

  const badSoreness = Object.entries(form.soreness).some(
    ([muscle, level]) => !(MUSCLES as readonly string[]).includes(muscle) || !(SORENESS_CYCLE as readonly number[]).includes(level as number),
  );
  if (badSoreness) errors.soreness = "One of the soreness ratings isn't valid.";

  if (form.painAreas.some((a) => !(PAIN_AREAS as readonly string[]).includes(a))) {
    errors.painAreas = "One of the pain areas isn't valid.";
  } else if (form.hasPain && form.painAreas.length === 0) {
    errors.painAreas = "Pick the area that hurts.";
  }

  if (!(SESSION_MINUTES_OPTIONS as readonly number[]).includes(form.minutesAvailable)) {
    errors.minutesAvailable = "Choose how much time you have.";
  }

  if (form.note.length > NOTE_MAX_LENGTH) {
    errors.note = `Keep the note under ${NOTE_MAX_LENGTH} characters.`;
  }

  return errors;
}

export const hasErrors = (errors: CheckinErrors) => Object.keys(errors).length > 0;

export const isReadinessLevel = (value: unknown): value is Readiness =>
  (READINESS_LEVELS as readonly unknown[]).includes(value);
