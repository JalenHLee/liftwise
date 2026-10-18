"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useSyncExternalStore, useTransition } from "react";
import { ErrorText, PrimaryButton, ReadinessCard, SecondaryButton, SectionLabel, WorkingState } from "@/components/ui";
import { formatDateLabel, localDateString, READINESS_COPY } from "@/lib/checkin/logic";
import { skipsWithPending, withPending, type SetSyncState, type SyncOp } from "@/lib/logging/queue";
import { startRest, type Rest } from "@/lib/logging/rest";
import { canResume, nextSet, prefill, setsOf, summarize, toRow, type SetDraft, type SetRef } from "@/lib/logging/sets";
import type { LoggedSetRow } from "@/lib/logging/types";
import { getExercise } from "@/lib/exercises/library";
import { SPLIT_NAMES } from "@/lib/engine/templates";
import { details, readinessTags, repsPerSet, rirTarget, setsByReps, weightLabel } from "@/lib/session/display";
import type { SessionExercise, SessionPlan } from "@/lib/session/types";
import { buildSession, finishSession, resumeSession } from "./actions";
import { FinishScreen, SummaryStats } from "./FinishScreen";
import { RestTimer } from "./RestTimer";
import { LoggedRow, PlannedRow, SetEditor } from "./SetRows";
import { getQueue, useSyncQueue } from "./useSync";

const noSubscribe = () => () => {};

/** The phone's local date; null while rendering on the server (its clock and time zone differ). */
function useLocalToday(): string | null {
  return useSyncExternalStore(noSubscribe, () => localDateString(new Date()), () => null);
}

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

type ExerciseLogging = {
  sets: LoggedSetRow[];
  stateOf: (id: string) => SetSyncState;
  skipped: boolean;
  /** The set with the editor open here, if it's in this exercise. */
  open: { setNumber: number; editing: LoggedSetRow | null; initial: SetDraft } | null;
  readOnly: boolean;
  onSelect: (setNumber: number) => void;
  onLog: (setNumber: number, draft: SetDraft) => void;
  onDelete: (set: LoggedSetRow) => void;
  onCancel: () => void;
  onSkip: (skip: boolean) => void;
};

function ExerciseBlock({ exercise, index, log }: { exercise: SessionExercise; index: number; log: ExerciseLogging }) {
  const weight = weightLabel(exercise);
  const label = exercise.swappedFrom ? `Replaces ${getExercise(exercise.swappedFrom).name}` : getExercise(exercise.exerciseId).type;

  if (log.skipped) {
    return (
      <section className="flex flex-col border-t border-hairline py-6" aria-labelledby={`ex-${index}`}>
        <SectionLabel index={index}>{label}</SectionLabel>
        <div className="mt-2 flex items-baseline justify-between gap-4">
          <h2 id={`ex-${index}`} className="font-serif text-[26px] leading-[1.1] text-muted">
            {exercise.name}
          </h2>
          {!log.readOnly && (
            <button type="button" onClick={() => log.onSkip(false)} className="label-mono -my-3 shrink-0 py-3 pl-4 text-ink">
              Undo skip
            </button>
          )}
        </div>
        <p className="label-mono mt-2">Skipped</p>
        {log.sets.length > 0 && (
          <ol className="mt-4 flex flex-col gap-2" aria-label={`${exercise.name} sets`}>
            {log.sets.map((s) => (
              <li key={s.id}>
                <LoggedRow set={s} state={log.stateOf(s.id)} />
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  }

  const logged = new Map(log.sets.map((s) => [s.set_number, s]));
  const unlogged = exercise.sets - log.sets.filter((s) => s.set_number <= exercise.sets).length;
  const planned = `${repsPerSet(exercise)}${exercise.load.kind === "weight" ? ` · ${weight}` : ""}`;

  return (
    <section className="flex flex-col border-t border-hairline py-7" aria-labelledby={`ex-${index}`}>
      <SectionLabel index={index}>{label}</SectionLabel>
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

      {exercise.load.kind === "calibration" && log.sets.length === 0 && (
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
        {Array.from({ length: exercise.sets }, (_, i) => {
          const n = i + 1;
          const set = logged.get(n);
          if (log.open?.setNumber === n) {
            return (
              <li key={n} className="py-1">
                <SetEditor
                  key={set?.id ?? `new-${n}`}
                  exercise={exercise}
                  setNumber={n}
                  initial={log.open.initial}
                  editing={log.open.editing !== null}
                  onLog={(draft) => log.onLog(n, draft)}
                  onDelete={() => set && log.onDelete(set)}
                  onCancel={log.onCancel}
                />
              </li>
            );
          }
          return (
            <li key={n}>
              {set ? (
                <LoggedRow set={set} state={log.stateOf(set.id)} onEdit={log.readOnly ? undefined : () => log.onSelect(n)} />
              ) : (
                <PlannedRow setNumber={n} text={planned} onSelect={log.readOnly ? undefined : () => log.onSelect(n)} />
              )}
            </li>
          );
        })}
      </ol>

      {!log.readOnly && unlogged > 0 && (
        <button type="button" onClick={() => log.onSkip(true)} className="label-mono mt-3 self-start py-3 pr-4">
          {log.sets.length ? "Skip the rest" : "Skip exercise"}
        </button>
      )}
    </section>
  );
}

export type CompletedInfo = { at: string; rating: number | null; note: string | null };

export function SessionView({
  date,
  sessionId,
  plan,
  buildsLeft,
  checkinChanged,
  serverSets,
  serverSkips,
  completed,
}: {
  date: string;
  sessionId: string;
  plan: SessionPlan;
  buildsLeft: number;
  checkinChanged: boolean;
  serverSets: LoggedSetRow[];
  serverSkips: string[];
  completed: CompletedInfo | null;
}) {
  const router = useRouter();
  const queue = useSyncQueue();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Changes made on this page, so the view stays right after they sync (until the next refresh).
  const [localOps, setLocalOps] = useState<SyncOp[]>([]);
  const [selected, setSelected] = useState<SetRef | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const copy = READINESS_COPY[plan.readiness.level];
  const localToday = useLocalToday();

  const ops = [...localOps, ...(queue?.ops() ?? [])];
  const sets = withPending(serverSets, ops, sessionId);
  const skipped = skipsWithPending(serverSkips, ops, sessionId);
  const stateOf = (id: string): SetSyncState => queue?.stateOf(id) ?? "saved";
  const readOnly = completed !== null;
  const started = sets.length > 0;
  const pending = queue?.ops().filter((op) => op.kind === "upsert" && op.set.session_id === sessionId).length ?? 0;
  const waiting = (queue?.hasFailures ?? false) && pending > 0;

  const current = readOnly ? null : (selected ?? nextSet(plan, sets, skipped));
  const closeRest = useCallback(() => setRest(null), []);

  function apply(op: SyncOp) {
    setLocalOps((list) => [...list, op]);
    const q = getQueue();
    q.enqueue(op);
    void q.flush();
  }

  function logSet(exercise: SessionExercise, setNumber: number, draft: SetDraft, existing: LoggedSetRow | undefined) {
    const id = existing?.id ?? crypto.randomUUID();
    apply({ kind: "upsert", set: toRow(sessionId, exercise, setNumber, draft, id, existing?.logged_at ?? new Date().toISOString()) });
    setSelected(null);
    if (!existing) {
      const after = nextSet(plan, [...sets, toRow(sessionId, exercise, setNumber, draft, id, "")], skipped);
      const next = after ? `${plan.exercises.find((e) => e.exerciseId === after.exerciseId)?.name ?? ""}, set ${after.setNumber}` : "Finish workout";
      setRest(startRest(exercise.restSeconds, next));
    }
  }

  function setSkip(exerciseId: string, skip: boolean) {
    const list = skip ? [...new Set([...skipped, exerciseId])] : skipped.filter((id) => id !== exerciseId);
    apply({ kind: "skips", sessionId, exerciseIds: list });
    if (current?.exerciseId === exerciseId) setSelected(null);
  }

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

  async function finish(rating: number, note: string): Promise<string | null> {
    const sent = await getQueue().flush();
    if (!sent) return "Your sets are safe on this phone but haven't reached the server yet. Try again when you have signal.";
    try {
      const result = await finishSession({ sessionId, rating, note });
      if ("error" in result) return result.error;
    } catch {
      return "Couldn't reach the server. Try again when you have signal.";
    }
    setFinishing(false);
    setRest(null);
    router.refresh();
    window.scrollTo(0, 0);
    return null;
  }

  function resume() {
    setResumeError(null);
    startTransition(async () => {
      try {
        const result = await resumeSession({ sessionId, date: localDateString(new Date()) });
        if ("error" in result) setResumeError(result.error);
        else router.refresh();
      } catch {
        setResumeError("Couldn't reach the server. Try again when you have signal.");
      }
    });
  }

  const summary = summarize(plan, sets, skipped);

  if (finishing) {
    return (
      <FinishScreen
        summary={summary}
        pendingSets={pending}
        onBack={() => setFinishing(false)}
        onFinish={finish}
      />
    );
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

  const logging = (exercise: SessionExercise): ExerciseLogging => {
    const own = setsOf(exercise.exerciseId, sets);
    const isOpen = current?.exerciseId === exercise.exerciseId;
    const editing = isOpen ? (own.find((s) => s.set_number === current.setNumber) ?? null) : null;
    return {
      sets: own,
      stateOf,
      skipped: skipped.includes(exercise.exerciseId),
      open: isOpen
        ? {
            setNumber: current.setNumber,
            editing,
            initial: editing ? { weightKg: editing.weight_kg, reps: editing.reps, rir: editing.rir } : prefill(exercise, current.setNumber, sets),
          }
        : null,
      readOnly,
      onSelect: (n) => setSelected({ exerciseId: exercise.exerciseId, setNumber: n }),
      onLog: (n, draft) => logSet(exercise, n, draft, own.find((s) => s.set_number === n)),
      onDelete: (set) => {
        apply({ kind: "delete", id: set.id, sessionId });
        setSelected(null);
      },
      onCancel: () => setSelected(null),
      onSkip: (skip) => setSkip(exercise.exerciseId, skip),
    };
  };

  return (
    <div className={rest ? "pb-28" : undefined}>
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

      {completed && (
        <div className="mt-8 flex flex-col gap-5 rounded-card bg-fill px-6 py-6">
          <div className="flex flex-col gap-2">
            <span className="label-mono">Workout done</span>
            {completed.rating !== null && (
              <p className="font-serif text-[32px] leading-none text-ink">
                {completed.rating} <em className="text-muted">of 5</em>
              </p>
            )}
            {completed.note && <p className="text-[15px] leading-snug text-ink">{completed.note}</p>}
          </div>
          <SummaryStats summary={summary} />
          {localToday !== null && canResume(date, localToday) && (
            <>
              <SecondaryButton type="button" onClick={resume} disabled={isPending} className="disabled:opacity-60">
                {isPending ? "Reopening…" : "Resume workout"}
              </SecondaryButton>
              {resumeError && <ErrorText>{resumeError}</ErrorText>}
            </>
          )}
        </div>
      )}

      {checkinChanged && !readOnly && (
        <div role="status" className="mt-8 flex flex-col gap-3 rounded-card bg-fill px-5 py-5">
          {started ? (
            <p className="text-[15px] leading-snug text-ink">Your check-in changed after you started logging, so this session stays as it is.</p>
          ) : (
            <>
              <p className="text-[15px] leading-snug text-ink">Your check-in changed. Rebuild to update.</p>
              {rebuildControl}
            </>
          )}
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

      {!readOnly && (
        <>
          <div className="mt-8 flex border-t border-hairline pt-6">
            {started ? (
              <>
                <Stat value={`${summary.setsDone}/${summary.setsPlanned}`} label="Sets done" />
                <Stat value={summary.volumeKg.toLocaleString("en-US")} label="Volume kg" />
              </>
            ) : (
              <>
                <Stat value={plan.exercises.length} label="Lifts" />
                <Stat value={plan.estimatedMinutes} label="Est. min" />
                <Stat value={rirTarget(plan)} label="RIR target" />
              </>
            )}
          </div>
          {plan.droppedForTime.length > 0 && (
            <p className="label-mono mt-4">Left out for time: {plan.droppedForTime.map((e) => e.name).join(" · ")}</p>
          )}
        </>
      )}

      <div className="mt-8">
        {plan.exercises.map((e, i) => (
          <ExerciseBlock key={e.exerciseId} exercise={e} index={i + 1} log={logging(e)} />
        ))}
      </div>

      {!readOnly && (
        <div className="flex flex-col gap-3 border-t border-hairline pt-7">
          {pending > 0 && (
            <p role="status" className="label-mono flex items-center gap-2">
              <span aria-hidden="true" className={`size-1.5 rounded-full ${waiting ? "bg-accent" : "bg-muted"}`} />
              {waiting ? `${pending} set${pending === 1 ? "" : "s"} saved on this phone · will sync` : "Saving…"}
            </p>
          )}
          <PrimaryButton type="button" onClick={() => setFinishing(true)}>
            Finish workout
          </PrimaryButton>
          {!started && !checkinChanged && rebuildControl}
        </div>
      )}

      {rest && !readOnly && <RestTimer rest={rest} onClose={closeRest} />}
    </div>
  );
}
