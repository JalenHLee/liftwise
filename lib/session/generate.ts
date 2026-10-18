import { getExercise } from "@/lib/exercises/library";
import { MUSCLES, type CheckIn } from "@/lib/engine/types";
import { buildUserMessage, callWithTimeout, PROMPT_VERSION, SESSION_MODEL, SYSTEM_PROMPT, type AiClient } from "./ai";
import { buildDraft, exerciseLoad, mergeCheckIn, programDay, type DraftInput } from "./draft";
import { allowedSubstitutes } from "./substitutes";
import type { SessionPlan, SessionSource, ValidationResult } from "./types";
import { checkIds, checkInvariants, noteAdditions, parseAiOutput } from "./validate";

export type GenerateInput = DraftInput & { note: string };

export type GeneratedSession = {
  plan: SessionPlan;
  source: SessionSource;
  /** Set whenever Claude was asked, even if its answer wasn't used. */
  model: string | null;
  promptVersion: string | null;
  rawOutput: string | null;
  validation: ValidationResult;
};

const ids = (plan: SessionPlan) => plan.exercises.map((e) => e.exerciseId);

/**
 * Today's session: engine draft -> Claude (swaps, note reading, explanations) -> validator.
 * Any failure (no key, error, timeout, bad JSON, rule breach) gives the rules-only plan,
 * so the user always gets a session.
 */
export async function generateSession(input: GenerateInput, ai: AiClient | null, timeoutMs?: number): Promise<GeneratedSession> {
  const draft = buildDraft(input);
  const { equipment, goal } = input.profile;

  const rules = (fallbackReason: ValidationResult["fallbackReason"], errors: string[] = [], rawOutput: string | null = null): GeneratedSession => ({
    plan: draft,
    source: "rules",
    model: ai ? SESSION_MODEL : null,
    promptVersion: ai ? PROMPT_VERSION : null,
    rawOutput,
    validation: { ok: false, fallbackReason, errors, dropped: [] },
  });
  if (!ai) return rules("no_api_key");

  const allowed = allowedSubstitutes(ids(draft), equipment, input.checkIn.painAreas);
  const call = await callWithTimeout(ai, { system: SYSTEM_PROMPT, user: buildUserMessage(draft, { ...input.checkIn, note: input.note }, allowed) }, timeoutMs);
  if (call.status !== "ok") return rules(call.status, [call.error]);

  const parsed = parseAiOutput(call.raw);
  if (!parsed.ok) return rules(parsed.kind, parsed.errors, call.raw);
  const output = parsed.output;
  const idErrors = checkIds(output, draft, allowed);
  if (idErrors.length) return rules("invalid_output", idErrors, call.raw);

  // Pain or soreness read from the note: re-run the engine with it (only ever more conservative).
  const added = noteAdditions(output);
  const checkIn: CheckIn = mergeCheckIn(input.checkIn, added);
  const fromNote: SessionPlan["fromNote"] = {
    painAreas: checkIn.painAreas.filter((a) => !input.checkIn.painAreas.includes(a)),
    soreness: Object.fromEntries(
      MUSCLES.filter((m) => (checkIn.soreness[m] ?? 1) > (input.checkIn.soreness[m] ?? 1)).map((m) => [m, checkIn.soreness[m]]),
    ),
  };
  const changed = fromNote.painAreas.length > 0 || Object.keys(fromNote.soreness).length > 0;
  const engine = changed ? buildDraft({ ...input, checkIn, fromNote }) : draft;
  const allowedNow = changed ? allowedSubstitutes(ids(engine), equipment, checkIn.painAreas) : allowed;

  const dropped: string[] = [];
  const exercises = engine.exercises.map((e) => ({ ...e }));
  for (const swap of output.swaps) {
    const i = exercises.findIndex((e) => e.exerciseId === swap.from);
    if (i < 0 || !(allowedNow[swap.from] ?? []).includes(swap.to)) {
      dropped.push(`Swap ${swap.from} -> ${swap.to} no longer applies`);
      continue;
    }
    const next = getExercise(swap.to);
    // The substitute has the same type, so the original's program prescription is its target too.
    const original = exercises[i];
    const oldTag = original.progressionTag;
    const target = programDay(input.program, goal, input.dayIndex).exercises.find((e) => e.exerciseId === swap.from) ?? original;
    const load = exerciseLoad(next, target, input, { level: engine.readiness.level, deload: engine.deload.deload });
    delete original.targetReps;
    delete original.progressionTag;
    exercises[i] = {
      ...original,
      exerciseId: next.id,
      name: next.name,
      load: load.load,
      ...(load.targetReps !== undefined && { targetReps: load.targetReps }),
      ...(load.tag && { progressionTag: load.tag }),
      swappedFrom: swap.from,
      tags: [...original.tags.filter((t) => t !== oldTag), ...(load.tag ? [load.tag] : []), "SWAPPED"],
      explanation: swap.reason.trim(),
    };
  }
  for (const { exerciseId, text } of output.explanations) {
    const target = exercises.find((e) => e.exerciseId === exerciseId || e.swappedFrom === exerciseId);
    if (!target) dropped.push(`Explanation for ${exerciseId} no longer applies`);
    else if (!target.swappedFrom) target.explanation = text.trim();
  }

  const final: SessionPlan = { ...engine, exercises, summary: output.daySummary.trim() };
  const breaches = checkInvariants(engine, final, checkIn.painAreas);
  if (breaches.length) return rules("invalid_output", breaches, call.raw);

  return {
    plan: final,
    source: "ai",
    model: SESSION_MODEL,
    promptVersion: PROMPT_VERSION,
    rawOutput: call.raw,
    validation: { ok: true, errors: [], dropped },
  };
}
