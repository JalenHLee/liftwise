import Anthropic from "@anthropic-ai/sdk";
import { getExercise } from "@/lib/exercises/library";
import { MUSCLES, PAIN_AREAS, type CheckIn } from "@/lib/engine/types";
import type { SessionPlan } from "./types";

export const SESSION_MODEL = "claude-sonnet-5";
/** Bump whenever the system prompt or the output schema changes, so evals can compare versions. */
export const PROMPT_VERSION = "session-v1";
export const AI_TIMEOUT_MS = 15_000;
export const MAX_EXPLANATION_CHARS = 280;
export const MAX_SUMMARY_CHARS = 400;

export const SYSTEM_PROMPT = `You are the coach voice of Liftwise, a fitness app. A rules engine has already built today's workout; every number in it (sets, reps, weight, reps in reserve, rest) is final and is not yours to change.

You may only do three things:
1. Swap an exercise for one of the substitutes listed for it under "allowedSubstitutes", and only when today's check-in gives a reason (for example the note mentions a joint that feels off, or equipment that is busy). Never swap without a reason. Use the exact ids given.
2. Read the free-text note. If it clearly mentions pain in a body area, add that area to "addedPainAreas" (allowed values: ${PAIN_AREAS.join(", ")}). If it clearly mentions a sore muscle, add it to "addedSoreness" with a level from 2 (a little) to 5 (very sore) (muscles: ${MUSCLES.join(", ")}). Only add what the note actually says. These can only make the day easier.
3. Write explanations: one short, plain sentence for each exercise that has adjustments or that you swapped (the swap's sentence goes in its "reason"), plus a 1-2 sentence "daySummary" for the whole day.

Style: calm, warm, concrete, no hype, no emoji. Explain why, using the check-in. Never diagnose an injury or name a medical condition; if there is pain, say to get it checked by a medic/doctor. Do not mention numbers that are not in the plan.

Reply with JSON only, matching the schema. Leave lists empty when there is nothing to add.`;

/** JSON schema for Claude's reply. Deliberately has no fields for sets, reps, weight, RIR or rest. */
export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["swaps", "addedPainAreas", "addedSoreness", "explanations", "daySummary"],
  properties: {
    swaps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "reason"],
        properties: { from: { type: "string" }, to: { type: "string" }, reason: { type: "string" } },
      },
    },
    addedPainAreas: { type: "array", items: { type: "string", enum: [...PAIN_AREAS] } },
    addedSoreness: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["muscle", "level"],
        properties: { muscle: { type: "string", enum: [...MUSCLES] }, level: { type: "integer" } },
      },
    },
    explanations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["exerciseId", "text"],
        properties: { exerciseId: { type: "string" }, text: { type: "string" } },
      },
    },
    daySummary: { type: "string" },
  },
} as const;

/** The JSON message Claude sees: the draft plan, today's check-in and the allowed substitutes. */
export function buildUserMessage(draft: SessionPlan, checkIn: CheckIn & { note: string }, allowed: Record<string, string[]>): string {
  return JSON.stringify({
    checkIn: {
      sleepHours: checkIn.sleepHours,
      energy: `${checkIn.energy}/5`,
      soreness: checkIn.soreness,
      painAreas: checkIn.painAreas,
      minutesAvailable: checkIn.minutesAvailable,
      note: checkIn.note,
    },
    readiness: draft.readiness,
    deload: draft.deload,
    removedForPain: draft.removedForPain.map((e) => e.name),
    exercises: draft.exercises.map((e) => ({
      id: e.exerciseId,
      name: e.name,
      mainMuscle: getExercise(e.exerciseId).primaryMuscle,
      sets: e.sets,
      reps: `${e.repMin}-${e.repMax}`,
      repsInReserve: e.rirMin === e.rirMax ? `${e.rirMin}` : `${e.rirMin}-${e.rirMax}`,
      adjustments: e.adjustments,
      allowedSubstitutes: (allowed[e.exerciseId] ?? []).map((id) => ({ id, name: getExercise(id).name })),
    })),
  });
}

export type AiRequest = { system: string; user: string };

/** Anything that can answer a request with raw text. Tests pass a fake; production uses Claude. */
export type AiClient = (request: AiRequest, signal: AbortSignal) => Promise<string>;

/** The real client: Claude via the Anthropic SDK, server-side only, with structured JSON output. */
export function anthropicClient(apiKey: string): AiClient {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: AI_TIMEOUT_MS });
  return async ({ system, user }, signal) => {
    const response = await client.messages.create(
      {
        model: SESSION_MODEL,
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: user }],
        thinking: { type: "disabled" },
        output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> } },
      },
      { signal },
    );
    if (response.stop_reason !== "end_turn") throw new Error(`Claude stopped early: ${response.stop_reason}`);
    return response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  };
}

export type AiCallResult =
  | { status: "ok"; raw: string }
  | { status: "error" | "timeout"; error: string };

/** Calls the client, giving up after `timeoutMs` even if the client ignores the abort signal. */
export async function callWithTimeout(client: AiClient, request: AiRequest, timeoutMs = AI_TIMEOUT_MS): Promise<AiCallResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AiCallResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ status: "timeout", error: `No reply within ${timeoutMs / 1000} seconds` });
    }, timeoutMs);
  });
  const call = client(request, controller.signal).then(
    (raw): AiCallResult => ({ status: "ok", raw }),
    (err: unknown): AiCallResult => ({ status: "error", error: err instanceof Error ? err.message : String(err) }),
  );
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
