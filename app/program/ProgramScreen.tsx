"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ErrorText, PillGroup, PrimaryButton, SecondaryButton, SectionLabel, WorkingState } from "@/components/ui";
import { SplitOptions } from "@/components/SplitOptions";
import { RECOMMENDED_SPLIT, SPLIT_NAMES, type SplitId } from "@/lib/engine/templates";
import type { EquipmentSetup, Experience } from "@/lib/engine/types";
import { DAYS_PER_WEEK_OPTIONS } from "@/lib/onboarding/validation";
import { replaceProgram } from "./actions";

type ProgramSummary = {
  name: string;
  split: SplitId | null;
  days: { name: string; exercises: string[] }[];
};

const daysLabel = (n: number) => `${n} day${n === 1 ? "" : "s"} a week`;

export function ProgramScreen({
  experience,
  equipment,
  daysPerWeek: currentDays,
  program,
}: {
  experience: Experience;
  equipment: EquipmentSetup;
  daysPerWeek: number;
  program: ProgramSummary;
}) {
  const router = useRouter();
  const [daysPerWeek, setDaysPerWeek] = useState(currentDays);
  const [split, setSplit] = useState<SplitId>(program.split ?? RECOMMENDED_SPLIT[currentDays]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const changed = daysPerWeek !== currentDays || split !== program.split;

  function pickDays(next: number) {
    setDaysPerWeek(next);
    // Keep the current split when it still fits; otherwise start from the recommended one.
    setSplit(next === currentDays && program.split ? program.split : RECOMMENDED_SPLIT[next]);
    setConfirming(false);
    setDone(false);
  }

  function replace() {
    setError(null);
    startTransition(async () => {
      const result = await replaceProgram({ daysPerWeek, split });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      setDone(true);
      router.refresh();
      window.scrollTo({ top: 0 });
    });
  }

  return (
    <>
      <div className="flex items-baseline justify-between">
        <Link href="/today" className="label-mono -my-3 flex min-h-11 items-center">
          ← Today
        </Link>
        <span className="label-mono">Program</span>
      </div>

      <h1 className="mt-10 mb-8 font-serif text-[46px] leading-[1.05] text-ink">
        Your <em>program</em>.
      </h1>

      {done && (
        <p role="status" className="mb-6 rounded-row bg-green-tint px-4 py-3 text-[15px] leading-snug text-green-text">
          Program replaced. Your next session starts at day 1.
        </p>
      )}

      <section className="flex flex-col gap-4 border-t border-hairline py-7" aria-labelledby="current-program">
        <SectionLabel>Current</SectionLabel>
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="current-program" className="font-serif text-[30px] leading-[1.1] text-ink">
            {program.name}
          </h2>
          <span className="label-mono shrink-0">{daysLabel(currentDays)}</span>
        </div>
        <ol className="flex flex-col">
          {program.days.map((day, i) => (
            <li key={i} className="flex flex-col gap-1 border-t border-hairline py-3.5 first:border-t-0 first:pt-0">
              <span className="flex items-baseline gap-3">
                <span className="label-mono w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-base text-ink">{day.name}</span>
              </span>
              <span className="pl-9 text-sm leading-snug text-muted">{day.exercises.join(", ")}</span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">Days run in order, whatever the weekday.</p>
      </section>

      <section className="flex flex-col gap-4 border-t border-hairline py-7">
        <SectionLabel index={1}>Frequency</SectionLabel>
        <h2 className="font-serif text-[30px] leading-[1.1] text-ink">How many days a week?</h2>
        <PillGroup options={DAYS_PER_WEEK_OPTIONS} value={daysPerWeek} onChange={pickDays} numeric />
      </section>

      <section className="flex flex-col gap-4 border-t border-hairline py-7">
        <SectionLabel index={2}>Split</SectionLabel>
        <h2 className="font-serif text-[30px] leading-[1.1] text-ink">How should we split it?</h2>
        <SplitOptions
          daysPerWeek={daysPerWeek}
          experience={experience}
          equipment={equipment}
          value={split}
          onChange={(next) => {
            setSplit(next);
            setConfirming(false);
            setDone(false);
          }}
          current={daysPerWeek === currentDays ? program.split : null}
        />
      </section>

      <div className="flex flex-col gap-3 border-t border-hairline pt-7">
        {error && <ErrorText>{error}</ErrorText>}
        {isPending ? (
          <WorkingState>Replacing your program…</WorkingState>
        ) : confirming ? (
          <div className="flex flex-col gap-4 rounded-card bg-fill px-6 py-6">
            <p className="font-serif text-[28px] leading-[1.1] text-ink">Replace your program?</p>
            <p className="text-[15px] leading-snug text-ink">
              {program.name} on {currentDays} days will be replaced by {SPLIT_NAMES[split]} on {daysPerWeek} days. Your next session
              starts at day 1. If today&apos;s session is already built, it stays as it is until you rebuild it.
            </p>
            <PrimaryButton type="button" onClick={replace}>
              Replace program
            </PrimaryButton>
            <SecondaryButton type="button" onClick={() => setConfirming(false)}>
              Cancel
            </SecondaryButton>
          </div>
        ) : changed ? (
          <PrimaryButton type="button" onClick={() => setConfirming(true)}>
            Replace my program
          </PrimaryButton>
        ) : (
          <p className="text-sm text-muted">Pick different days or a different split to replace your program.</p>
        )}
      </div>
    </>
  );
}
