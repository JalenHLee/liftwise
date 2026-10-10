"use client";

import { useMemo } from "react";
import type { SplitId } from "@/lib/engine/templates";
import type { EquipmentSetup, Experience } from "@/lib/engine/types";
import { splitOptions } from "@/lib/program/options";

/**
 * One row per split on offer for this many days: name, its days, "Recommended" for the app's
 * choice and the engine's honest notes on any tradeoff. Single choice, like a pill group.
 */
export function SplitOptions({
  daysPerWeek,
  experience,
  equipment,
  value,
  onChange,
  current,
}: {
  daysPerWeek: number;
  experience: Experience;
  equipment: EquipmentSetup;
  value: SplitId;
  onChange: (split: SplitId) => void;
  /** The user's current split, marked "Current" (Program screen). */
  current?: SplitId | null;
}) {
  const options = useMemo(() => splitOptions({ daysPerWeek, experience, equipment }), [daysPerWeek, experience, equipment]);
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Split">
      {options.map((o) => {
        const selected = o.split === value;
        const badge = [o.recommended && "Recommended", o.split === current && "Current"].filter(Boolean).join(" · ");
        return (
          <button
            key={o.split}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.split)}
            className={`flex min-h-11 flex-col gap-2 rounded-row border px-5 py-4 text-left transition-colors ${
              selected ? "border-ink bg-ink text-paper" : "border-hairline text-ink"
            }`}
          >
            {badge && (
              <span className={`font-mono text-[10.5px] uppercase tracking-[0.14em] ${selected ? "text-paper/75" : "text-accent"}`}>{badge}</span>
            )}
            <span className="font-serif text-[24px] leading-[1.1]">{o.name}</span>
            {(o.dayNames.length > 1 || o.rolling) && (
              <span className={`font-mono text-[10.5px] uppercase tracking-[0.14em] ${selected ? "text-paper/75" : "text-muted"}`}>
                {o.dayNames.length > 1 ? o.dayNames.join(" · ") : ""}
                {o.rolling ? `${o.dayNames.length > 1 ? "  ·  " : ""}Rolls over weeks` : ""}
              </span>
            )}
            {o.notes.length > 0 ? (
              <span className="flex flex-col gap-1">
                {o.notes.map((n) => (
                  <span key={n} className={`text-sm leading-snug ${selected ? "text-paper/85" : "text-muted"}`}>
                    {n}
                  </span>
                ))}
              </span>
            ) : (
              <span className={`text-sm leading-snug ${selected ? "text-paper/85" : "text-muted"}`}>
                Every muscle twice a week or more, within your weekly target.
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
