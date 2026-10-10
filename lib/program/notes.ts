import type { ProgramCheck } from "@/lib/engine/programCheck";
import type { Muscle } from "@/lib/engine/types";

/** "chest", "chest and back", "chest, back and core". */
function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (n: number) => String(Math.round(n * 10) / 10);

/** "9.5" or, when values differ, "9.5–10". */
function span(values: number[]): string {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? num(lo) : `${num(lo)}–${num(hi)}`;
}

/** 1 -> "once", 2 -> "twice", 1.3 -> "about 1.3 times", [1, 1.5] -> "1–1.5 times". */
function times(values: number[]): string {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo !== hi) return `${num(lo)}–${num(hi)} times`;
  if (lo === 1) return "once";
  if (lo === 2) return "twice";
  return Number.isInteger(lo) ? `${lo} times` : `about ${num(lo)} times`;
}

/** Who a note is about: every trained muscle, most of them, or the muscles by name. */
function who(muscles: Muscle[], trainedCount: number): { name: string; one: boolean } {
  if (muscles.length === trainedCount) return { name: "every muscle", one: true };
  if (muscles.length > trainedCount / 2) return { name: "most muscles", one: false };
  // "Chest gets", but "glutes get": most muscle names are plural.
  return { name: list(muscles), one: muscles.length === 1 && !muscles[0].endsWith("s") };
}

/**
 * Short, honest notes on a program's tradeoffs, built only from the engine's check
 * (never hand-written per split). An empty list means it meets every rule.
 */
export function programNotes(check: ProgramCheck): string[] {
  const trainedCount = Object.values(check.muscles).filter((m) => m.timesPerWeek > 0).length;
  const notes: string[] = [];
  for (const issue of check.issues) {
    switch (issue.kind) {
      case "untrained":
        notes.push(`${capitalise(list(issue.muscles))} ${who(issue.muscles, Infinity).one ? "isn't" : "aren't"} trained with your equipment.`);
        break;
      case "low_frequency": {
        const w = who(issue.muscles.map((m) => m.muscle), trainedCount);
        const subject = w.name === "every muscle" ? "each muscle" : w.name;
        notes.push(`Trains ${subject} ${times(issue.muscles.map((m) => m.timesPerWeek))} a week (twice is the target).`);
        break;
      }
      case "below_band":
      case "above_band": {
        const w = who(issue.muscles.map((m) => m.muscle), trainedCount);
        const side = issue.kind === "below_band" ? "below" : "above";
        notes.push(
          `${capitalise(w.name)} ${w.one ? "gets" : "get"} ${span(issue.muscles.map((m) => m.setsPerWeek))} sets a week, ${side} your ${issue.band.min}–${issue.band.max} target.`,
        );
        break;
      }
      case "session_cap":
        notes.push(`${capitalise(list(issue.muscles))} ${who(issue.muscles, Infinity).one ? "gets" : "get"} more than 10 sets in one session.`);
        break;
    }
  }
  return notes;
}
