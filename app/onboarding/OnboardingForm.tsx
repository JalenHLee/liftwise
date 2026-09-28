"use client";

import { useState, useTransition } from "react";
import { EQUIPMENT_SETUPS, EXPERIENCES, GOALS } from "@/lib/engine/types";
import type { EquipmentSetup, Experience, Goal } from "@/lib/engine/types";
import { weightedKeyLiftsFor } from "@/lib/onboarding/keyLifts";
import {
  DAYS_PER_WEEK_OPTIONS,
  SESSION_MINUTES_OPTIONS,
  isValid,
  validateOnboarding,
  type OnboardingErrors,
} from "@/lib/onboarding/validation";
import { saveOnboarding } from "./actions";
import { TapGroup } from "./TapGroup";

const GOAL_LABELS: Record<Goal, string> = {
  strength: "Strength",
  muscle: "Muscle",
  general: "General fitness",
};

const EQUIPMENT_LABELS: Record<EquipmentSetup, string> = {
  full_gym: "Full gym",
  unit_gym: "Unit gym",
  bodyweight: "Bodyweight",
};

const EXPERIENCE_LABELS: Record<Experience, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const SESSION_MINUTES_LABELS: Record<number, string> = Object.fromEntries(
  SESSION_MINUTES_OPTIONS.map((m) => [m, `${m} min`]),
);

export function OnboardingForm() {
  const [firstName, setFirstName] = useState("");
  const [goal, setGoal] = useState<Goal>("muscle");
  const [daysPerWeek, setDaysPerWeek] = useState<number>(4);
  const [sessionMinutes, setSessionMinutes] = useState<number>(60);
  const [equipment, setEquipment] = useState<EquipmentSetup>("full_gym");
  const [experience, setExperience] = useState<Experience>("beginner");
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const [isPending, startTransition] = useTransition();

  const keyLifts = weightedKeyLiftsFor(equipment);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const startingWeights: Record<string, number> = {};
    for (const lift of keyLifts) {
      const raw = weights[lift.id];
      if (raw !== undefined && raw.trim() !== "") {
        startingWeights[lift.id] = Number(raw);
      }
    }

    const input = { firstName, goal, daysPerWeek, sessionMinutes, equipment, experience, startingWeights };
    const clientErrors = validateOnboarding(input);
    if (!isValid(clientErrors)) {
      setErrors(clientErrors);
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = await saveOnboarding(input);
      if (result?.errors && !isValid(result.errors)) {
        setErrors(result.errors);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8 pb-12">
      <section className="flex flex-col gap-2">
        <label htmlFor="firstName" className="text-sm text-muted">
          First name
        </label>
        <input
          id="firstName"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="rounded-2xl border border-border bg-surface px-4 py-4 text-base text-foreground outline-none focus:border-accent"
          placeholder="What should we call you?"
        />
        {errors.firstName && <p className="text-sm text-danger">{errors.firstName}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-sm text-muted">Goal</span>
        <TapGroup options={GOALS} value={goal} onChange={setGoal} labels={GOAL_LABELS} />
        {errors.goal && <p className="text-sm text-danger">{errors.goal}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-sm text-muted">Training days per week</span>
        <TapGroup options={DAYS_PER_WEEK_OPTIONS} value={daysPerWeek} onChange={setDaysPerWeek} numeric />
        {errors.daysPerWeek && <p className="text-sm text-danger">{errors.daysPerWeek}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-sm text-muted">Session length</span>
        <TapGroup
          options={SESSION_MINUTES_OPTIONS}
          value={sessionMinutes}
          onChange={setSessionMinutes}
          labels={SESSION_MINUTES_LABELS}
        />
        {errors.sessionMinutes && <p className="text-sm text-danger">{errors.sessionMinutes}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-sm text-muted">Equipment</span>
        <TapGroup
          options={EQUIPMENT_SETUPS}
          value={equipment}
          onChange={(next) => {
            setEquipment(next);
            setWeights({});
          }}
          labels={EQUIPMENT_LABELS}
        />
        {errors.equipment && <p className="text-sm text-danger">{errors.equipment}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-sm text-muted">Experience</span>
        <TapGroup options={EXPERIENCES} value={experience} onChange={setExperience} labels={EXPERIENCE_LABELS} />
        {errors.experience && <p className="text-sm text-danger">{errors.experience}</p>}
      </section>

      {keyLifts.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <span className="text-sm text-muted">Starting weights (optional)</span>
            <p className="text-xs text-muted">
              Know your working weight for these lifts? Fill in what you know — skip the rest and
              we&apos;ll figure it out from your first sessions.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {keyLifts.map((lift) => (
              <label key={lift.id} className="flex items-center justify-between gap-4">
                <span className="text-base">{lift.name}</span>
                <span className="flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={weights[lift.id] ?? ""}
                    onChange={(e) => setWeights((prev) => ({ ...prev, [lift.id]: e.target.value }))}
                    placeholder="—"
                    className="w-20 rounded-2xl border border-border bg-surface px-3 py-3 text-right text-xl font-bold text-foreground outline-none focus:border-accent"
                  />
                  <span className="text-sm text-muted">kg</span>
                </span>
              </label>
            ))}
          </div>
          {errors.startingWeights && <p className="text-sm text-danger">{errors.startingWeights}</p>}
        </section>
      )}

      <p className="text-xs text-muted">
        Liftwise isn&apos;t medical advice. If something hurts, get it checked by a doctor or physio
        before training through it.
      </p>

      {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-2xl bg-accent py-4 text-base font-semibold text-accent-foreground disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Start training"}
      </button>
    </form>
  );
}
