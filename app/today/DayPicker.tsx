"use client";

import { useState } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/ui";
import type { TodayDay } from "@/lib/session/todayDay";

/** The first few exercises, so the list stays short: "Back squat, Deadlift, Hip thrust + 4 more". */
const preview = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(", ")} + ${names.length - 3} more` : names.join(", "));

const STATUS: Record<TodayDay["status"], string> = {
  next: "Next in your rotation",
  picked: "Your pick",
  built: "In today's session",
  built_old_program: "Built before your program changed",
};

/**
 * "Today: Push · next in your rotation", with a way to pick another day of the program.
 * Before building, a pick just changes what gets built. After building, it's a rebuild, so it
 * asks first and says how many rebuilds are left.
 */
export function DayPicker({
  day,
  days,
  buildsLeft,
  onPick,
  onRebuild,
}: {
  day: TodayDay;
  days: { name: string; exercises: string[] }[];
  /** Rebuilds left today, when a session is built. */
  buildsLeft: number;
  onPick: (index: number) => void;
  onRebuild: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<number | null>(null);

  function choose(index: number) {
    if (day.built) {
      if (index !== day.dayIndex) setConfirm(index);
      return;
    }
    onPick(index);
    setOpen(false);
  }

  return (
    <div className="flex flex-col rounded-row border border-hairline px-5 py-4">
      <div className="flex items-center justify-between gap-4">
        <span className="label-mono">Today</span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen((o) => !o);
            setConfirm(null);
          }}
          className="flex min-h-11 shrink-0 items-center rounded-full border border-hairline px-4 text-sm text-ink"
        >
          {open ? "Close" : "Change day"}
        </button>
      </div>
      <span className="-mt-1 font-serif text-[30px] leading-none text-ink">{day.dayName}</span>
      <span className="label-mono mt-2">
        {day.dayIndex !== null ? `Day ${day.dayIndex + 1} of ${days.length} · ` : ""}
        {STATUS[day.status]}
      </span>

      {open && (
        <div className="mt-4 flex flex-col gap-2 border-t border-hairline pt-4" role="radiogroup" aria-label="Program day">
          {days.map((d, i) => {
            const selected = i === day.dayIndex;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choose(i)}
                className={`flex min-h-11 flex-col gap-1 rounded-row border px-4 py-3 text-left transition-colors ${
                  selected ? "border-ink bg-ink text-paper" : "border-hairline text-ink"
                }`}
              >
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="text-base">
                    Day {i + 1} · {d.name}
                  </span>
                  {i === day.nextIndex && !day.built && (
                    <span className={`font-mono text-[10.5px] uppercase tracking-[0.14em] ${selected ? "text-paper/75" : "text-accent"}`}>Next</span>
                  )}
                </span>
                <span className={`text-sm leading-snug ${selected ? "text-paper/80" : "text-muted"}`}>{preview(d.exercises)}</span>
              </button>
            );
          })}

          {confirm !== null && (
            <div role="alertdialog" aria-label="Rebuild today's session?" className="mt-2 flex flex-col gap-3 rounded-card bg-fill px-5 py-5">
              {buildsLeft > 0 ? (
                <>
                  <p className="text-[15px] leading-snug text-ink">
                    Switching to Day {confirm + 1} · {days[confirm].name} rebuilds today&apos;s session. {buildsLeft === 1 ? "This is your last rebuild today." : `You have ${buildsLeft} rebuilds left today.`}
                  </p>
                  <PrimaryButton type="button" onClick={() => onRebuild(confirm)}>
                    Rebuild as {days[confirm].name}
                  </PrimaryButton>
                  <SecondaryButton type="button" onClick={() => setConfirm(null)}>
                    Cancel
                  </SecondaryButton>
                </>
              ) : (
                <p className="text-[15px] leading-snug text-ink">You&apos;ve used today&apos;s rebuilds, so today&apos;s session stays as it is.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
