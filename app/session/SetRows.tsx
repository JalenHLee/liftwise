"use client";

import { useState } from "react";
import { ErrorText, PillGroup, PrimaryButton } from "@/components/ui";
import { getExercise } from "@/lib/exercises/library";
import { isBodyweight, parseWeight, RIR_LABELS, RIR_OPTIONS, setProblem, stepReps, stepWeight, type SetDraft } from "@/lib/logging/sets";
import type { SetSyncState } from "@/lib/logging/queue";
import type { LoggedSetRow } from "@/lib/logging/types";
import { formatKg } from "@/lib/session/display";
import type { SessionExercise } from "@/lib/session/types";

const SYNC_LABEL: Record<SetSyncState, string> = { saving: "Saving…", waiting: "On phone", saved: "Saved" };

/** Small mono save state: "Saving…", "On phone" (kept on the phone, retrying) or "Saved". */
export function SyncMark({ state }: { state: SetSyncState }) {
  return (
    <span className="label-mono flex shrink-0 items-center gap-1.5" aria-label={state === "waiting" ? "Saved on this phone, will sync" : SYNC_LABEL[state]}>
      {state !== "saved" && <span aria-hidden="true" className={`size-1.5 rounded-full ${state === "waiting" ? "bg-accent" : "animate-pulse bg-muted motion-reduce:animate-none"}`} />}
      {SYNC_LABEL[state]}
    </span>
  );
}

export const setValue = (s: Pick<LoggedSetRow, "weight_kg" | "reps">) => `${s.weight_kg === null ? "" : `${formatKg(s.weight_kg)} kg × `}${s.reps}${s.weight_kg === null ? " reps" : ""}`;

/** A logged set. Tap to correct it (unless the workout is finished). */
export function LoggedRow({ set, state, onEdit }: { set: LoggedSetRow; state: SetSyncState; onEdit?: () => void }) {
  const content = (
    <>
      <span className="label-mono w-12 shrink-0">Set {set.set_number}</span>
      <span className="flex-1 text-[15px] text-ink">
        {setValue(set)}
        <span className="text-muted"> · RIR {RIR_LABELS[set.rir] ?? set.rir}</span>
      </span>
      <SyncMark state={state} />
    </>
  );
  const className = "flex min-h-12 w-full items-center gap-3 rounded-row bg-fill px-4 text-left";
  return onEdit ? (
    <button type="button" onClick={onEdit} className={className} aria-label={`Set ${set.set_number}: ${setValue(set)}, RIR ${set.rir}. Tap to correct`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

/** A set still to do. Tap to log it out of order. */
export function PlannedRow({ setNumber, text, onSelect }: { setNumber: number; text: string; onSelect?: () => void }) {
  const className = "flex min-h-12 w-full items-center gap-3 rounded-row border border-hairline px-4 text-left";
  const content = (
    <>
      <span className="label-mono w-12 shrink-0">Set {setNumber}</span>
      <span className="flex-1 text-[15px] text-muted">{text}</span>
    </>
  );
  return onSelect ? (
    <button type="button" onClick={onSelect} className={className}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function StepButton({ label, glyph, onClick }: { label: string; glyph: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-hairline text-xl leading-none text-ink active:bg-fill"
    >
      {glyph}
    </button>
  );
}

function Stepper({
  label,
  text,
  inputMode,
  placeholder,
  onText,
  onStep,
  unit,
}: {
  label: string;
  text: string;
  inputMode: "decimal" | "numeric";
  placeholder?: string;
  onText: (text: string) => void;
  onStep: (direction: 1 | -1) => void;
  unit: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <span className="label-mono">{label}</span>
      <div className="flex items-center gap-1">
        <StepButton label={`Less ${unit}`} glyph="−" onClick={() => onStep(-1)} />
        <input
          value={text}
          onChange={(e) => onText(e.target.value)}
          inputMode={inputMode}
          placeholder={placeholder}
          aria-label={label}
          className="w-full min-w-0 border-0 border-b border-transparent bg-transparent py-1 text-center font-serif text-[34px] leading-none text-ink outline-none placeholder:text-muted/50 focus:border-hairline"
        />
        <StepButton label={`More ${unit}`} glyph="+" onClick={() => onStep(1)} />
      </div>
    </div>
  );
}

/**
 * The open set: weight −/+ (or typed), reps −/+ (or typed) and a quick RIR pick, all prefilled
 * so an on-plan set is one tap on "Log set". Editing a logged set adds Delete and Cancel.
 */
export function SetEditor({
  exercise,
  setNumber,
  initial,
  editing,
  onLog,
  onDelete,
  onCancel,
}: {
  exercise: SessionExercise;
  setNumber: number;
  initial: SetDraft;
  editing: boolean;
  onLog: (draft: SetDraft) => void;
  onDelete?: () => void;
  onCancel?: () => void;
}) {
  const increment = getExercise(exercise.exerciseId).loadIncrementKg;
  const bodyweight = isBodyweight(exercise);
  const [weightText, setWeightText] = useState(initial.weightKg === null ? "" : formatKg(initial.weightKg));
  const [repsText, setRepsText] = useState(String(initial.reps));
  const [rir, setRir] = useState(initial.rir);
  const [error, setError] = useState<string | null>(null);

  const weightKg = weightText.trim() === "" ? null : (parseWeight(weightText) ?? Number.NaN);
  const reps = /^\d+$/.test(repsText.trim()) ? Number(repsText.trim()) : Number.NaN;

  function submit() {
    const draft = { weightKg, reps, rir };
    const problem = setProblem(exercise, draft);
    if (problem) {
      setError(problem);
      return;
    }
    onLog(draft);
  }

  return (
    <div className="flex flex-col gap-5 rounded-card border border-ink/70 px-4 pt-5 pb-4">
      <span className="label-mono">
        {editing ? `Correct set ${setNumber}` : `Set ${setNumber} of ${exercise.sets}`}
      </span>
      <div className="flex gap-4">
        {!bodyweight && (
          <Stepper
            label="Weight · kg"
            unit="weight"
            text={weightText}
            inputMode="decimal"
            placeholder="kg"
            onText={(t) => {
              setWeightText(t);
              setError(null);
            }}
            onStep={(d) => {
              setWeightText(formatKg(stepWeight(weightKg === null || Number.isNaN(weightKg) ? null : weightKg, increment, d)));
              setError(null);
            }}
          />
        )}
        <Stepper
          label="Reps"
          unit="reps"
          text={repsText}
          inputMode="numeric"
          onText={(t) => {
            setRepsText(t);
            setError(null);
          }}
          onStep={(d) => {
            setRepsText(String(stepReps(Number.isNaN(reps) ? initial.reps : reps, d)));
            setError(null);
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="label-mono">Reps in reserve</span>
        <div className="[&>div]:flex-nowrap [&_button]:flex-1 [&_button]:px-0">
          <PillGroup options={RIR_OPTIONS} value={rir as (typeof RIR_OPTIONS)[number]} onChange={setRir} labels={RIR_LABELS} size="sm" />
        </div>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <PrimaryButton type="button" onClick={submit}>
        {editing ? "Save correction" : `Log set ${setNumber}`}
      </PrimaryButton>
      {editing && (
        <div className="-mt-1 flex justify-between">
          <button type="button" onClick={onDelete} className="min-h-11 px-1 text-[15px] text-red-text">
            Delete set
          </button>
          <button type="button" onClick={onCancel} className="min-h-11 px-1 text-[15px] text-muted">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
