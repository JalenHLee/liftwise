import { afterEach, describe, expect, test, vi } from "vitest";
import { getExercise } from "@/lib/exercises/library";
import { sessionVolume } from "@/lib/engine/volume";
import type { CheckIn } from "@/lib/engine/types";
import { PROMPT_VERSION, SESSION_MODEL, type AiClient } from "./ai";
import { recommendedProgram } from "@/lib/program/program";
import { buildDraft } from "./draft";
import { generateSession, type GenerateInput } from "./generate";
import type { SessionPlan } from "./types";
import { checkInvariants, parseAiOutput } from "./validate";

const checkIn: CheckIn = { sleepHours: 8, energy: 4, soreness: {}, painAreas: [], minutesAvailable: 90 };
const input: GenerateInput = {
  profile: { goal: "muscle", experience: "intermediate", equipment: "full_gym" },
  program: recommendedProgram({ experience: "intermediate", equipment: "full_gym", daysPerWeek: 4 }),
  dayIndex: 0,
  checkIn,
  startingWeights: { "barbell-bench-press": { weightKg: 80, reps: 5 } },
  deload: { deload: false, reasons: [] },
  note: "",
};
const draft = buildDraft(input);
const ids = draft.exercises.map((e) => e.exerciseId);

const reply = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({ swaps: [], addedPainAreas: [], addedSoreness: [], explanations: [], daySummary: "A solid upper day. Move well.", ...patch });
const fake = (raw: string): AiClient => async () => raw;
const run = (raw: string, patch: Partial<GenerateInput> = {}) => generateSession({ ...input, ...patch }, fake(raw));

afterEach(() => vi.useRealTimers());

describe("Claude's part", () => {
  test("a valid reply is used: summary, swap and explanation, numbers untouched", async () => {
    const result = await run(
      reply({
        swaps: [{ from: "barbell-bench-press", to: "dumbbell-bench-press", reason: "Dumbbells are easier on the shoulders today." }],
        explanations: [{ exerciseId: "pull-up", text: "Same as written." }],
      }),
    );
    expect(result.source).toBe("ai");
    expect(result.model).toBe(SESSION_MODEL);
    expect(result.promptVersion).toBe(PROMPT_VERSION);
    expect(result.validation.ok).toBe(true);
    expect(result.plan.summary).toBe("A solid upper day. Move well.");

    const swapped = result.plan.exercises[0];
    expect(swapped).toMatchObject({ exerciseId: "dumbbell-bench-press", swappedFrom: "barbell-bench-press", explanation: "Dumbbells are easier on the shoulders today." });
    expect(swapped.tags).toContain("SWAPPED");
    expect(swapped.load).toEqual({ kind: "calibration", instruction: expect.any(String) }); // no starting set for dumbbells
    for (const field of ["sets", "repMin", "repMax", "rirMin", "rirMax", "restSeconds"] as const) expect(swapped[field]).toBe(draft.exercises[0][field]);
    expect(result.plan.exercises.find((e) => e.exerciseId === "pull-up")!.explanation).toBe("Same as written.");
  });

  test("the prompt carries the draft, the note and the allowed substitutes", async () => {
    const client = vi.fn<AiClient>(async () => reply());
    await generateSession({ ...input, note: "left knee feels tight" }, client);
    const { user } = client.mock.calls[0][0];
    const sent = JSON.parse(user);
    expect(sent.checkIn.note).toBe("left knee feels tight");
    expect(sent.exercises.map((e: { id: string }) => e.id)).toEqual(ids);
    expect(sent.exercises[0].allowedSubstitutes.map((s: { id: string }) => s.id)).toContain("dumbbell-bench-press");
  });

  test("a note that mentions pain makes the plan more conservative", async () => {
    const result = await run(
      reply({ addedPainAreas: ["shoulder"], daySummary: "Your note mentions a sore shoulder, so we've left out anything that loads it. Please get it checked by a medic/doctor." }),
      { note: "my right shoulder hurts when I press" },
    );
    expect(result.source).toBe("ai");
    expect(result.plan.fromNote.painAreas).toEqual(["shoulder"]);
    expect(result.plan.exercises.some((e) => getExercise(e.exerciseId).loadsAreas.includes("shoulder"))).toBe(false);
    expect(result.plan.removedForPain.length).toBeGreaterThan(0);
    expect(result.plan.painMessage).toMatch(/medic\/doctor/);
    const total = (p: SessionPlan) => p.exercises.reduce((n, e) => n + e.sets, 0);
    expect(total(result.plan)).toBeLessThan(total(draft));
  });

  test("soreness read from the note re-runs the engine (and can change the day's colour)", async () => {
    const result = await run(reply({ addedSoreness: [{ muscle: "chest", level: 4 }] }), { note: "chest is wrecked from Tuesday" });
    expect(result.plan.fromNote.soreness).toEqual({ chest: 4 });
    expect(result.plan.readiness.level).toBe("yellow");
    expect(result.plan.exercises[0].tags).toContain("½ SETS · SORE CHEST");
  });

  test("a swap that no longer fits after the note is dropped, not applied", async () => {
    const result = await run(
      reply({
        addedPainAreas: ["shoulder"],
        swaps: [{ from: "barbell-bench-press", to: "dumbbell-bench-press", reason: "Variety." }],
      }),
    );
    expect(result.source).toBe("ai");
    expect(result.plan.exercises.some((e) => e.exerciseId === "dumbbell-bench-press")).toBe(false);
    expect(result.validation.dropped).toHaveLength(1);
  });
});

describe("validator rejects and falls back to the rules-only plan", () => {
  const rejected = async (raw: string, reason = "invalid_output") => {
    const result = await run(raw);
    expect(result.source).toBe("rules");
    expect(result.plan).toEqual(draft);
    expect(result.validation).toMatchObject({ ok: false, fallbackReason: reason });
    expect(result.rawOutput).toBe(raw); // kept for evals and debugging
    return result;
  };

  test("an attempt to change numbers", async () => {
    await rejected(reply({ swaps: [{ from: "barbell-bench-press", to: "dumbbell-bench-press", reason: "Lighter.", sets: 6 }] }));
    await rejected(reply({ exercises: [{ id: "barbell-bench-press", sets: 6, weightKg: 100 }] }));
  });

  test("unknown exercise ids", async () => {
    await rejected(reply({ swaps: [{ from: "barbell-bench-press", to: "atlas-stone", reason: "Fun." }] }));
    await rejected(reply({ explanations: [{ exerciseId: "made-up", text: "Hi." }] }));
  });

  test("a swap that isn't on the allowed list (wrong muscle, or an exercise already in the session)", async () => {
    await rejected(reply({ swaps: [{ from: "barbell-bench-press", to: "back-squat", reason: "Legs instead." }] }));
    await rejected(reply({ swaps: [{ from: "barbell-bench-press", to: ids[1], reason: "Twice." }] }));
  });

  test("a swap to an exercise that loads an excluded pain area", async () => {
    // Barbell rows load the lower back, so with lower-back pain they're not a valid pull-up substitute.
    const painful = { ...checkIn, painAreas: ["lower_back" as const] };
    expect(buildDraft({ ...input, checkIn: painful }).exercises.some((e) => e.exerciseId === "pull-up")).toBe(true);
    const result = await run(reply({ swaps: [{ from: "pull-up", to: "barbell-row", reason: "Rows instead." }] }), { checkIn: painful });
    expect(result.source).toBe("rules");
    expect(result.validation.errors.join()).toMatch(/not an allowed substitute/);
  });

  test("invalid JSON or a missing summary", async () => {
    await rejected("Sure! Here's your plan: {", "invalid_json");
    await rejected(reply({ daySummary: "" }));
    await rejected(reply({ addedSoreness: [{ muscle: "chest", level: 9 }] }));
  });

  test("the invariant check catches number changes, volume increases and excluded exercises", () => {
    const tamper = (fn: (p: SessionPlan) => void) => {
      const p: SessionPlan = structuredClone(draft);
      fn(p);
      return checkInvariants(draft, p, []);
    };
    expect(tamper(() => {})).toEqual([]);
    expect(tamper((p) => (p.exercises[0].sets += 1)).join()).toMatch(/sets changed/);
    expect(tamper((p) => (p.exercises[0].restSeconds = 60)).join()).toMatch(/restSeconds changed/);
    expect(tamper((p) => (p.exercises[0].load = { kind: "weight", kg: 200 })).join()).toMatch(/weight changed/);
    const bigger = tamper((p) => p.exercises.push({ ...p.exercises[0], exerciseId: "dip", swappedFrom: undefined }));
    expect(bigger.join()).toMatch(/More sets for chest/);
    expect(bigger.join()).toMatch(/number of exercises changed/);
    expect(checkInvariants(draft, draft, ["shoulder"]).join()).toMatch(/loads a painful area/);
  });

  test("parsing is strict about the shape", () => {
    expect(parseAiOutput(reply()).ok).toBe(true);
    expect(parseAiOutput("[]").ok).toBe(false);
    expect(parseAiOutput(reply({ swaps: "none" })).ok).toBe(false);
    expect(parseAiOutput(reply({ addedPainAreas: ["heart"] })).ok).toBe(false);
  });
});

describe("Claude failing never leaves the user without a session", () => {
  test("no API key", async () => {
    const result = await generateSession(input, null);
    expect(result).toMatchObject({ source: "rules", model: null, promptVersion: null, validation: { fallbackReason: "no_api_key" } });
    expect(result.plan.exercises.length).toBeGreaterThan(0);
  });

  test("an API error", async () => {
    const result = await generateSession(input, async () => {
      throw new Error("529 overloaded");
    });
    expect(result).toMatchObject({ source: "rules", model: SESSION_MODEL, validation: { fallbackReason: "error", errors: ["529 overloaded"] } });
  });

  test("taking longer than the time limit", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const slow: AiClient = (_req, signal) =>
      new Promise((resolve) => {
        signal.addEventListener("abort", () => (aborted = true));
        setTimeout(() => resolve(reply()), 60_000);
      });
    const pending = generateSession(input, slow);
    await vi.advanceTimersByTimeAsync(15_000);
    const result = await pending;
    expect(result.source).toBe("rules");
    expect(result.validation.fallbackReason).toBe("timeout");
    expect(aborted).toBe(true);
  });

  test("the rules plan never has more volume than the green-day template", async () => {
    const result = await generateSession({ ...input, checkIn: { ...checkIn, sleepHours: 4, energy: 1 } }, null);
    const before = sessionVolume(draft.exercises);
    const after = sessionVolume(result.plan.exercises);
    for (const m of Object.keys(before) as (keyof typeof before)[]) expect(after[m]).toBeLessThanOrEqual(before[m]);
  });
});
