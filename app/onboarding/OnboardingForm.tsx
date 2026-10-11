"use client";

import { useState, useTransition } from "react";
import { EQUIPMENT_SETUPS, EXPERIENCES, GOALS } from "@/lib/engine/types";
import type { EquipmentSetup, Experience, Goal } from "@/lib/engine/types";
import { weightedKeyLiftsFor } from "@/lib/onboarding/keyLifts";
import {
  DAYS_PER_WEEK_OPTIONS,
  SESSION_MINUTES_OPTIONS,
  PRECISE_STARTING_REPS,
  isValid,
  parseStartingSets,
  validateOnboarding,
  type StartingSetDraft,
  type OnboardingErrors,
} from "@/lib/onboarding/validation";
import { ErrorText, PillGroup, PrimaryButton, SectionLabel } from "@/components/ui";
import { SplitOptions } from "@/components/SplitOptions";
import { RECOMMENDED_SPLIT, type SplitId } from "@/lib/engine/templates";
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
  const [split, setSplit] = useState<SplitId>(RECOMMENDED_SPLIT[4]);
  const [sessionMinutes, setSessionMinutes] = useState<number>(60);
  const [equipment, setEquipment] = useState<EquipmentSetup>("full_gym");
  const [experience, setExperience] = useState<Experience>("beginner");
  const [weights, setWeights] = useState<Record<string, StartingSetDraft>>({});
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const [isPending, startTransition] = useTransition();

  const keyLifts = weightedKeyLiftsFor(equipment);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const drafts: Record<string, StartingSetDraft> = {};
    for (const lift of keyLifts) {
      if (weights[lift.id]) drafts[lift.id] = weights[lift.id];
    }
    const { sets: startingWeights, error: startingError } = parseStartingSets(drafts);
    if (startingError) {
      setErrors({ startingWeights: startingError });
      return;
    }

    const input = { firstName, goal, daysPerWeek, split, sessionMinutes, equipment, experience, startingWeights };
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
        <PillGroup
          options={DAYS_PER_WEEK_OPTIONS}
          value={daysPerWeek}
          onChange={(next) => {
            setDaysPerWeek(next);
            setSplit(RECOMMENDED_SPLIT[next]);
          }}
          numeric
        />
        {errors.daysPerWeek && <ErrorText>{errors.daysPerWeek}</ErrorText>}
      </Section>

      <Section index={4} label="Split" question="How should we split your week?">
        <p className="-mt-1 text-sm text-muted">Days run in order, whatever the weekday. You can change this later.</p>
        <SplitOptions daysPerWeek={daysPerWeek} experience={experience} equipment={equipment} value={split} onChange={setSplit} />
        {errors.split && <ErrorText>{errors.split}</ErrorText>}
      </Section>

      <Section index={5} label="Session length" question="How long is each session?">
        <PillGroup
          options={SESSION_MINUTES_OPTIONS}
          value={sessionMinutes}
          onChange={setSessionMinutes}
          labels={SESSION_MINUTES_LABELS}
        />
        {errors.sessionMinutes && <ErrorText>{errors.sessionMinutes}</ErrorText>}
      </Section>

      <Section index={6} label="Equipment" question="Where do you train?">
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

      <Section index={7} label="Experience" question="How experienced are you?">
        <PillGroup options={EXPERIENCES} value={experience} onChange={setExperience} labels={EXPERIENCE_LABELS} />
        {errors.experience && <ErrorText>{errors.experience}</ErrorText>}
      </Section>

      {keyLifts.length > 0 && (
        <Section index={8} label="Starting weights · optional" question="Know your working weights?">
          <p className="-mt-1 text-sm text-muted">
            Your last solid set on each lift, if you remember it. Skip any you don&apos;t and we&apos;ll help you
            find the weight in your first session.
          </p>
          <div className="flex flex-col gap-2">
            {keyLifts.map((lift) => {
              const draft = weights[lift.id] ?? { weight: "", reps: "" };
              const update = (patch: Partial<StartingSetDraft>) =>
                setWeights((prev) => ({ ...prev, [lift.id]: { ...draft, ...patch } }));
              const lessPrecise = Number(draft.reps) > PRECISE_STARTING_REPS;
              return (
                <fieldset key={lift.id} className="flex flex-col rounded-row bg-fill px-5 py-4">
                  <legend className="sr-only">{lift.name}</legend>
                  <span aria-hidden className="text-base">
                    {lift.name}
                  </span>
                  <span className="label-mono mt-1">Your last solid set</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <input
                      aria-label={`${lift.name} weight in kilograms`}
                      inputMode="decimal"
                      value={draft.weight}
                      onChange={(e) => update({ weight: e.target.value })}
                      placeholder="—"
                      className="min-h-11 w-20 border-0 border-b border-hairline bg-transparent text-right font-serif text-[28px] leading-none text-ink outline-none placeholder:text-muted/60 focus:border-ink"
                    />
                    <span className="label-mono">kg</span>
                    <span className="px-1 font-serif text-[22px] leading-none text-muted">×</span>
                    <input
                      aria-label={`${lift.name} reps`}
                      inputMode="numeric"
                      value={draft.reps}
                      onChange={(e) => update({ reps: e.target.value })}
                      placeholder="—"
                      className="min-h-11 w-14 border-0 border-b border-hairline bg-transparent text-right font-serif text-[28px] leading-none text-ink outline-none placeholder:text-muted/60 focus:border-ink"
                    />
                    <span className="label-mono">reps</span>
                  </div>
                  {lessPrecise && (
                    <p className="mt-1 text-sm text-muted">Above {PRECISE_STARTING_REPS} reps the estimate is less precise.</p>
                  )}
                </fieldset>
              );
            })}
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
