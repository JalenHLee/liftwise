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
import { ErrorText, PillGroup, PrimaryButton, SectionLabel } from "@/components/ui";
import { saveOnboarding } from "./actions";

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
    <form onSubmit={handleSubmit} className="flex flex-col pb-12">
      <Section index={1} label="Name" question="What should we call you?" htmlFor="firstName">
        <input
          id="firstName"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="min-h-11 border-0 border-b border-hairline bg-transparent py-2 text-lg text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-ink"
          placeholder="First name"
        />
        {errors.firstName && <ErrorText>{errors.firstName}</ErrorText>}
      </Section>

      <Section index={2} label="Goal" question="What are you training for?">
        <PillGroup options={GOALS} value={goal} onChange={setGoal} labels={GOAL_LABELS} />
        {errors.goal && <ErrorText>{errors.goal}</ErrorText>}
      </Section>

      <Section index={3} label="Frequency" question="How many days a week?">
        <PillGroup options={DAYS_PER_WEEK_OPTIONS} value={daysPerWeek} onChange={setDaysPerWeek} numeric />
        {errors.daysPerWeek && <ErrorText>{errors.daysPerWeek}</ErrorText>}
      </Section>

      <Section index={4} label="Session length" question="How long is each session?">
        <PillGroup
          options={SESSION_MINUTES_OPTIONS}
          value={sessionMinutes}
          onChange={setSessionMinutes}
          labels={SESSION_MINUTES_LABELS}
        />
        {errors.sessionMinutes && <ErrorText>{errors.sessionMinutes}</ErrorText>}
      </Section>

      <Section index={5} label="Equipment" question="Where do you train?">
        <PillGroup
          options={EQUIPMENT_SETUPS}
          value={equipment}
          onChange={(next) => {
            setEquipment(next);
            setWeights({});
          }}
          labels={EQUIPMENT_LABELS}
        />
        {errors.equipment && <ErrorText>{errors.equipment}</ErrorText>}
      </Section>

      <Section index={6} label="Experience" question="How experienced are you?">
        <PillGroup options={EXPERIENCES} value={experience} onChange={setExperience} labels={EXPERIENCE_LABELS} />
        {errors.experience && <ErrorText>{errors.experience}</ErrorText>}
      </Section>

      {keyLifts.length > 0 && (
        <Section index={7} label="Starting weights · optional" question="Know your working weights?">
          <p className="-mt-1 text-sm text-muted">
            Fill in what you know and skip the rest. We&apos;ll work it out from your first sessions.
          </p>
          <div className="flex flex-col gap-2">
            {keyLifts.map((lift) => (
              <label
                key={lift.id}
                className="flex min-h-16 items-center justify-between gap-4 rounded-row bg-fill pr-4 pl-5"
              >
                <span className="text-base">{lift.name}</span>
                <span className="flex items-baseline gap-2">
                  <input
                    inputMode="decimal"
                    value={weights[lift.id] ?? ""}
                    onChange={(e) => setWeights((prev) => ({ ...prev, [lift.id]: e.target.value }))}
                    placeholder="—"
                    className="min-h-11 w-20 border-0 border-b border-hairline bg-transparent text-right font-serif text-[28px] leading-none text-ink outline-none placeholder:text-muted/60 focus:border-ink"
                  />
                  <span className="label-mono">kg</span>
                </span>
              </label>
            ))}
          </div>
          {errors.startingWeights && <ErrorText>{errors.startingWeights}</ErrorText>}
        </Section>
      )}

      <div className="flex flex-col gap-4 border-t border-hairline pt-8">
        {errors.form && <ErrorText>{errors.form}</ErrorText>}
        <PrimaryButton type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Start training"}
        </PrimaryButton>
      </div>
    </form>
  );
}

/** One onboarding question: hairline on top, mono number label, serif question. */
function Section({
  index,
  label,
  question,
  htmlFor,
  children,
}: {
  index: number;
  label: string;
  question: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const Heading = htmlFor ? "label" : "h2";
  return (
    <section className="flex flex-col gap-4 border-t border-hairline py-8">
      <SectionLabel index={index}>{label}</SectionLabel>
      <Heading htmlFor={htmlFor} className="font-serif text-[30px] leading-[1.1] text-ink">
        {question}
      </Heading>
      {children}
    </section>
  );
}
