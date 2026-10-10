"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ErrorText, ReadinessCard, SecondaryButton, SectionLabel, WorkingState } from "@/components/ui";
import { formatDateLabel, READINESS_COPY } from "@/lib/checkin/logic";
import { getExercise } from "@/lib/exercises/library";
import { SPLIT_NAMES } from "@/lib/engine/templates";
import { details, readinessTags, repsPerSet, rirTarget, setsByReps, weightLabel } from "@/lib/session/display";
import type { SessionExercise, SessionPlan } from "@/lib/session/types";
import { buildSession } from "./actions";

const TEMPLATE_NAMES: Record<SessionPlan["template"], string> = { ...SPLIT_NAMES, custom: "Custom" };

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-1 flex-col gap-1.5 border-l border-hairline pl-4 first:border-l-0 first:pl-0">
      <span className="font-serif text-[40px] leading-none text-ink">{value}</span>
      <span className="label-mono">{label}</span>
    </div>
  );
}

function Tag({ children }: { children: string }) {
  return <span className="rounded-full bg-fill px-3 py-1.5 font-mono text-[10.5px] uppercase leading-none tracking-[0.14em] text-ink">{children}</span>;
}

function ExerciseBlock({ exercise, index }: { exercise: SessionExercise; index: number }) {
  const weight = weightLabel(exercise);
  return (
    <section className="flex flex-col border-t border-hairline py-7" aria-labelledby={`ex-${index}`}>
      <SectionLabel index={index}>{exercise.swappedFrom ? `Replaces ${getExercise(exercise.swappedFrom).name}` : getExercise(exercise.exerciseId).type}</SectionLabel>
      <h2 id={`ex-${index}`} className="mt-3 font-serif text-[30px] leading-[1.1] text-ink">
        {exercise.name}
      </h2>

      <div className="mt-4 flex items-baseline justify-between gap-4">
        <span className="font-serif text-[52px] leading-none text-ink">{setsByReps(exercise)}</span>
        {weight && (
          <span className={`text-right font-serif leading-none text-ink ${exercise.load.kind === "weight" ? "text-[40px]" : "text-[24px]"}`}>
            {exercise.load.kind === "weight" ? (
              <>
                {weight.replace(" kg", "")}
                <span className="ml-1 font-sans text-base text-muted">kg</span>
              </>
            ) : (
              weight
            )}
          </span>
        )}
      </div>
      <p className="label-mono mt-3">{details(exercise).join("  ·  ")}</p>

      {exercise.load.kind === "calibration" && (
        <p className="mt-4 rounded-row bg-fill px-4 py-3 text-[15px] leading-snug text-ink">{exercise.load.instruction}</p>
      )}

      {exercise.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {exercise.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
      )}
      {exercise.explanation && <p className="mt-3 text-[15px] leading-snug text-muted">{exercise.explanation}</p>}

      <ol className="mt-5 flex flex-col gap-2" aria-label={`${exercise.name} sets`}>
        {Array.from({ length: exercise.sets }, (_, i) => (
          <li key={i} className="flex min-h-11 items-center justify-between rounded-row border border-hairline px-4">
            <span className="label-mono">Set {i + 1}</span>
            <span className="text-[15px] text-ink">
              {repsPerSet(exercise)}
              {exercise.load.kind === "weight" && <span className="text-muted"> · {weight}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SessionView({
  date,
  plan,
  buildsLeft,
  checkinChanged,
}: {
  date: string;
  plan: SessionPlan;
  buildsLeft: number;
  checkinChanged: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const copy = READINESS_COPY[plan.readiness.level];

  function rebuild() {
    setError(null);
    startTransition(async () => {
      const result = await buildSession({ date });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const rebuildControl = (
    <>
      {isPending ? (
        <WorkingState hint="A few seconds">Building your session…</WorkingState>
      ) : (
        <SecondaryButton type="button" onClick={rebuild} disabled={buildsLeft === 0} className="disabled:opacity-50">
          {buildsLeft === 0 ? "No rebuilds left today" : `Rebuild session · ${buildsLeft} left`}
        </SecondaryButton>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </>
  );

  return (
    <>
      <div className="flex items-baseline justify-between">
        <Link href="/today" className="label-mono -my-3 py-3 pr-4">
          ← Today
        </Link>
        <span className="label-mono">{formatDateLabel(date)}</span>
      </div>

      <h1 className="mt-10 font-serif text-[46px] leading-[1.05] text-ink">
        {plan.dayName} <em>day</em>
      </h1>
      <p className="label-mono mt-3">
        Day {plan.dayIndex + 1} of {plan.dayCount} · {TEMPLATE_NAMES[plan.template]}
      </p>

      {checkinChanged && (
        <div role="status" className="mt-8 flex flex-col gap-3 rounded-card bg-fill px-5 py-5">
          <p className="text-[15px] leading-snug text-ink">Your check-in changed. Rebuild to update.</p>
          {rebuildControl}
        </div>
      )}

      <div className="mt-8">
        <ReadinessCard level={plan.readiness.level} label={plan.deload.deload ? "Deload week" : copy.label} line={plan.summary} tags={readinessTags(plan)} />
      </div>

      {plan.painMessage && (
        <div className="mt-3 rounded-row bg-red-tint px-4 py-3 text-sm leading-snug text-red-text">
          <p>{plan.painMessage}</p>
          {plan.removedForPain.length > 0 && <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.14em] opacity-80">Left out: {plan.removedForPain.map((e) => e.name).join(" · ")}</p>}
        </div>
      )}

      <div className="mt-8 flex border-t border-hairline pt-6">
        <Stat value={plan.exercises.length} label="Lifts" />
        <Stat value={plan.estimatedMinutes} label="Est. min" />
        <Stat value={rirTarget(plan)} label="RIR target" />
      </div>
      {plan.droppedForTime.length > 0 && (
        <p className="label-mono mt-4">Left out for time: {plan.droppedForTime.map((e) => e.name).join(" · ")}</p>
      )}

      <div className="mt-8">
        {plan.exercises.map((e, i) => (
          <ExerciseBlock key={e.exerciseId} exercise={e} index={i + 1} />
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-hairline pt-7">
        {!checkinChanged && rebuildControl}
      </div>
    </>
  );
}
