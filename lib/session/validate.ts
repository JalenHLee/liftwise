import { getExercise } from "@/lib/exercises/library";
import { sessionVolume } from "@/lib/engine/volume";
import { MUSCLES, PAIN_AREAS, type CheckIn, type Muscle, type PainArea } from "@/lib/engine/types";
import { MAX_EXPLANATION_CHARS, MAX_SUMMARY_CHARS } from "./ai";
import type { SessionExercise, SessionPlan } from "./types";

export type AiOutput = {
  swaps: { from: string; to: string; reason: string }[];
  addedPainAreas: PainArea[];
  addedSoreness: { muscle: Muscle; level: number }[];
  explanations: { exerciseId: string; text: string }[];
  daySummary: string;
};

type Parsed = { ok: true; output: AiOutput } | { ok: false; kind: "invalid_json" | "invalid_output"; errors: string[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** Fails when an object has any key beyond `allowed` (e.g. Claude trying to send "sets" or "weight"). */
function extraKeys(obj: Record<string, unknown>, allowed: string[], where: string): string[] {
  return Object.keys(obj)
    .filter((k) => !allowed.includes(k))
    .map((k) => `Unexpected field "${k}" in ${where}`);
}

/** Parses Claude's raw reply and checks its shape strictly. Anything unexpected is an error. */
export function parseAiOutput(raw: string): Parsed {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, kind: "invalid_json", errors: ["Reply is not valid JSON"] };
  }
  if (!isObject(data)) return { ok: false, kind: "invalid_output", errors: ["Reply is not an object"] };

  const errors = extraKeys(data, ["swaps", "addedPainAreas", "addedSoreness", "explanations", "daySummary"], "reply");
  const list = (key: string) => {
    const v = data[key];
    if (!Array.isArray(v)) errors.push(`"${key}" must be a list`);
    return Array.isArray(v) ? v : [];
  };

  for (const s of list("swaps")) {
    if (!isObject(s)) { errors.push("A swap is not an object"); continue; }
    errors.push(...extraKeys(s, ["from", "to", "reason"], "a swap"));
    if (typeof s.from !== "string" || typeof s.to !== "string") errors.push("A swap is missing its ids");
    if (!isText(s.reason, MAX_EXPLANATION_CHARS)) errors.push("A swap reason is missing or too long");
  }
  for (const a of list("addedPainAreas")) {
    if (!(PAIN_AREAS as readonly unknown[]).includes(a)) errors.push(`Unknown pain area "${String(a)}"`);
  }
  for (const s of list("addedSoreness")) {
    if (!isObject(s)) { errors.push("A soreness entry is not an object"); continue; }
    errors.push(...extraKeys(s, ["muscle", "level"], "a soreness entry"));
    if (!(MUSCLES as readonly unknown[]).includes(s.muscle)) errors.push(`Unknown muscle "${String(s.muscle)}"`);
    if (typeof s.level !== "number" || !Number.isInteger(s.level) || s.level < 2 || s.level > 5) errors.push("Soreness level must be 2-5");
  }
  for (const e of list("explanations")) {
    if (!isObject(e)) { errors.push("An explanation is not an object"); continue; }
    errors.push(...extraKeys(e, ["exerciseId", "text"], "an explanation"));
    if (typeof e.exerciseId !== "string") errors.push("An explanation is missing its exercise id");
    if (!isText(e.text, MAX_EXPLANATION_CHARS)) errors.push("An explanation is missing or too long");
  }
  if (!isText(data.daySummary, MAX_SUMMARY_CHARS)) errors.push("Day summary is missing or too long");

  return errors.length ? { ok: false, kind: "invalid_output", errors } : { ok: true, output: data as AiOutput };
}

/** Pain areas and soreness Claude read in the note, as check-in additions. */
export function noteAdditions(output: AiOutput): { painAreas: PainArea[]; soreness: CheckIn["soreness"] } {
  const soreness: CheckIn["soreness"] = {};
  for (const { muscle, level } of output.addedSoreness) soreness[muscle] = Math.max(soreness[muscle] ?? 0, level);
  return { painAreas: [...new Set(output.addedPainAreas)], soreness };
}

/** Checks Claude's ids against the draft it was shown: every id known, every swap on the allowed list. */
export function checkIds(output: AiOutput, draft: SessionPlan, allowed: Record<string, string[]>): string[] {
  const errors: string[] = [];
  const inDraft = new Set(draft.exercises.map((e) => e.exerciseId));
  const known = (id: string) => {
    try {
      getExercise(id);
      return true;
    } catch {
      return false;
    }
  };
  const fromSeen = new Set<string>();
  const toSeen = new Set<string>();
  for (const s of output.swaps) {
    if (!known(s.from) || !known(s.to)) errors.push(`Unknown exercise id in swap ${s.from} -> ${s.to}`);
    else if (!inDraft.has(s.from)) errors.push(`Swap from ${s.from}, which isn't in today's plan`);
    else if (!(allowed[s.from] ?? []).includes(s.to)) errors.push(`Swap ${s.from} -> ${s.to} is not an allowed substitute`);
    if (fromSeen.has(s.from) || toSeen.has(s.to)) errors.push(`Exercise swapped more than once: ${s.from} -> ${s.to}`);
    fromSeen.add(s.from);
    toSeen.add(s.to);
  }
  for (const e of output.explanations) {
    if (!known(e.exerciseId)) errors.push(`Unknown exercise id in explanation: ${e.exerciseId}`);
    else if (!inDraft.has(e.exerciseId) && !toSeen.has(e.exerciseId)) errors.push(`Explanation for ${e.exerciseId}, which isn't in today's plan`);
  }
  return errors;
}

const NUMBER_FIELDS = ["sets", "repMin", "repMax", "rirMin", "rirMax", "restSeconds"] as const;

/**
 * The final safety net, comparing the finished plan with the engine's own plan for the same
 * check-in: every number unchanged, nothing that loads a painful area, no muscle (and no
 * session total) gets more sets, and every exercise is a known one or an allowed swap.
 */
export function checkInvariants(engine: SessionPlan, final: SessionPlan, painAreas: PainArea[]): string[] {
  const errors: string[] = [];
  if (final.exercises.length !== engine.exercises.length) errors.push("The number of exercises changed");

  final.exercises.forEach((e: SessionExercise, i) => {
    const base = engine.exercises[i];
    let exercise;
    try {
      exercise = getExercise(e.exerciseId);
    } catch {
      errors.push(`Unknown exercise id ${e.exerciseId}`);
      return;
    }
    if (!base) return;
    const originalId = e.swappedFrom ?? e.exerciseId;
    if (originalId !== base.exerciseId) errors.push(`Exercise ${i + 1} doesn't match the engine's plan`);
    for (const field of NUMBER_FIELDS) {
      if (e[field] !== base[field]) errors.push(`${e.name}: ${field} changed from ${base[field]} to ${e[field]}`);
    }
    if (!e.swappedFrom && JSON.stringify(e.load) !== JSON.stringify(base.load)) errors.push(`${e.name}: weight changed`);
    if (exercise.loadsAreas.some((a) => painAreas.includes(a))) errors.push(`${e.name} loads a painful area`);
  });

  const before = sessionVolume(engine.exercises);
  const after = sessionVolume(final.exercises);
  for (const m of MUSCLES) if (after[m] > before[m]) errors.push(`More sets for ${m} than the engine planned`);
  const total = (p: SessionPlan) => p.exercises.reduce((n, e) => n + e.sets, 0);
  if (total(final) > total(engine)) errors.push("More total sets than the engine planned");
  return errors;
}
