"use client";

import { useState } from "react";
import { ErrorText, Field, PillGroup, PrimaryButton, SectionLabel, WorkingState } from "@/components/ui";
import { NOTE_MAX_LENGTH } from "@/lib/checkin/logic";
import { RATINGS, type WorkoutSummary } from "@/lib/logging/sets";

export function SummaryStats({ summary }: { summary: WorkoutSummary }) {
  const stats = [
    { value: `${summary.setsDone}`, of: `/${summary.setsPlanned}`, label: "Sets" },
    { value: summary.volumeKg.toLocaleString("en-US"), of: " kg", label: "Volume" },
    { value: `${summary.liftsDone}`, of: `/${summary.liftsPlanned}`, label: "Lifts" },
  ];
  return (
    <div className="flex">
      {stats.map((s) => (
        <div key={s.label} className="flex min-w-0 flex-1 flex-col gap-1.5 border-l border-hairline pl-4 first:border-l-0 first:pl-0">
          <span className="truncate font-serif text-[34px] leading-none text-ink">
            {s.value}
            <span className="font-sans text-sm text-muted">{s.of}</span>
          </span>
          <span className="label-mono">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/** "How did it go?": rating 1–5, an optional note and the summary. Saving marks the session finished. */
export function FinishScreen({
  summary,
  pendingSets,
  onBack,
  onFinish,
}: {
  summary: WorkoutSummary;
  /** Sets still on the phone; finishing sends them first. */
  pendingSets: number;
  onBack: () => void;
  onFinish: (rating: number, note: string) => Promise<string | null>;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (rating === null) {
      setError("Pick how it went, from 1 to 5.");
      return;
    }
    setError(null);
    setSaving(true);
    const problem = await onFinish(rating, note);
    setSaving(false);
    if (problem) setError(problem);
  }

  const partial = summary.setsDone < summary.setsPlanned;

  return (
    <>
      <div className="flex items-baseline justify-between">
        <button type="button" onClick={onBack} className="label-mono -my-3 py-3 pr-4">
          ← Session
        </button>
        <span className="label-mono">Finish</span>
      </div>

      <h1 className="mt-10 font-serif text-[46px] leading-[1.05] text-ink">
        How did it <em>go?</em>
      </h1>
      <p className="mt-3 text-[15px] leading-snug text-muted">
        {summary.setsDone === 0
          ? "No sets logged. You can still finish; nothing changes for next time."
          : partial
            ? "A partial session still counts. Next time builds on the sets you logged."
            : "Every set done. Next time builds on what you logged."}
      </p>

      <div className="mt-8 border-t border-hairline pt-6">
        <SummaryStats summary={summary} />
        {summary.skipped > 0 && <p className="label-mono mt-4">Skipped {summary.skipped} exercise{summary.skipped === 1 ? "" : "s"}</p>}
      </div>

      <section className="mt-8 flex flex-col gap-4 border-t border-hairline pt-6" aria-labelledby="rating-label">
        <span id="rating-label">
          <SectionLabel index={1}>Rating</SectionLabel>
        </span>
        <PillGroup options={RATINGS} value={(rating ?? 0) as (typeof RATINGS)[number]} onChange={setRating} numeric />
        <div className="flex justify-between">
          <span className="label-mono">Rough</span>
          <span className="label-mono">Great</span>
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-4 border-t border-hairline pt-6">
        <SectionLabel index={2}>Note</SectionLabel>
        <Field
          label="Optional"
          value={note}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Anything to remember next time?"
          onChange={(e) => setNote(e.target.value)}
        />
      </section>

      <div className="mt-10 flex flex-col gap-3">
        {saving ? (
          <WorkingState hint={pendingSets > 0 ? `${pendingSets} set${pendingSets === 1 ? "" : "s"} to send` : undefined}>Saving…</WorkingState>
        ) : (
          <PrimaryButton type="button" onClick={save}>
            Save and finish
          </PrimaryButton>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </>
  );
}
