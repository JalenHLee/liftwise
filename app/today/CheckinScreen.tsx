"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { PAIN_MESSAGE } from "@/lib/engine/modifiers";
import { MUSCLES, PAIN_AREAS } from "@/lib/engine/types";
import type { Muscle, PainArea } from "@/lib/engine/types";
import {
  ENERGY_OPTIONS,
  NOTE_MAX_LENGTH,
  defaultForm,
  formatDateLabel,
  formatSleep,
  localDateString,
  nextSoreness,
  readinessDisplay,
  snapshotReadiness,
  stepSleep,
  togglePainArea,
  SLEEP_MAX,
  SLEEP_MIN,
  type CheckinForm,
  type SavedCheckin,
  type SorenessLevel,
} from "@/lib/checkin/logic";
import { rowToSaved, type CheckinRow } from "@/lib/checkin/save";
import { SESSION_MINUTES_OPTIONS } from "@/lib/onboarding/validation";
import { ErrorText, Field, PillGroup, PrimaryButton, ReadinessCard, SecondaryButton, SectionLabel, WorkingState } from "@/components/ui";
import { buildSession } from "@/app/session/actions";
import { saveCheckin } from "./actions";

const noopSubscribe = () => () => {};
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

/** Soreness chip styles by level: 0 outline, 2 subtle fill, 3 yellow, 4 red, 5 solid. */
const SORENESS_STYLES: Record<SorenessLevel, string> = {
  0: "border-hairline text-ink",
  2: "border-fill bg-fill text-ink",
  3: "border-yellow-tint bg-yellow-tint text-yellow-text",
  4: "border-red-tint bg-red-tint text-red-text",
  5: "border-ink bg-ink text-paper",
};

const chipBase = "flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] leading-none transition-colors";

function RoundButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-12 shrink-0 items-center justify-center rounded-full border border-hairline text-ink transition-opacity disabled:opacity-30"
    >
      {children}
    </button>
  );
}

const MinusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M1 7h12" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M1 7h12M7 1v12" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-hairline py-7">
      <SectionLabel index={index}>{title}</SectionLabel>
      {children}
    </section>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-hairline py-4">
      <span className="label-mono shrink-0">{label}</span>
      <span className="text-right text-base text-ink">{children}</span>
    </div>
  );
}

function Summary({ saved }: { saved: SavedCheckin }) {
  const { form } = saved;
  const sore = MUSCLES.filter((m) => form.soreness[m]).map((m) => `${titleCase(m)} ${form.soreness[m]}`);
  return (
    <div className="flex flex-col">
      <SummaryRow label="Sleep">
        <span className="font-serif text-[26px] leading-none">{formatSleep(form.sleepHours)}</span> h
      </SummaryRow>
      <SummaryRow label="Energy">
        <span className="font-serif text-[26px] leading-none">{form.energy}</span> / 5
      </SummaryRow>
      <SummaryRow label="Soreness">{sore.length > 0 ? sore.join(", ") : "None"}</SummaryRow>
      <SummaryRow label="Pain">{form.hasPain ? form.painAreas.map(titleCase).join(", ") : "None"}</SummaryRow>
      <SummaryRow label="Time">
        <span className="font-serif text-[26px] leading-none">{form.minutesAvailable}</span> min
      </SummaryRow>
      {form.note && <SummaryRow label="Note">{form.note}</SummaryRow>}
      {form.hasPain && <p className="rounded-row bg-red-tint px-4 py-3 text-sm leading-snug text-red-text">{PAIN_MESSAGE}</p>}
    </div>
  );
}

export function CheckinScreen({
  sessionMinutes,
  recent,
  sessionDates,
}: {
  sessionMinutes: number;
  recent: CheckinRow[];
  /** Local dates that already have a built session. */
  sessionDates: string[];
}) {
  const router = useRouter();
  // The server can't know the user's local date, so it is read on the device after load.
  const today = useSyncExternalStore(noopSubscribe, () => localDateString(new Date()), () => null);

  const [form, setForm] = useState<CheckinForm>(() => defaultForm(sessionMinutes));
  const [justSaved, setJustSaved] = useState<SavedCheckin | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isBuilding, startBuilding] = useTransition();

  const fromServer = useMemo(() => recent.map(rowToSaved).find((c) => c?.date === today) ?? null, [recent, today]);
  const saved = justSaved?.date === today ? justSaved : fromServer;
  const showForm = !saved || editing;
  const sessionHref = today ? `/session?date=${today}` : "/today";
  const hasSession = today !== null && sessionDates.includes(today);

  const live = useMemo(() => readinessDisplay(snapshotReadiness(form)), [form]);

  if (today === null) return <div className="min-h-[60vh]" />;

  const set = (patch: Partial<CheckinForm>) => setForm((f) => ({ ...f, ...patch }));

  function submit() {
    if (today === null) return;
    setError(null);
    startTransition(async () => {
      const result = await saveCheckin({ date: today, form });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setJustSaved(result.saved);
      setEditing(false);
      window.scrollTo({ top: 0 });
    });
  }

  function build() {
    if (today === null) return;
    setError(null);
    startBuilding(async () => {
      const result = await buildSession({ date: today });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(sessionHref);
    });
  }

  function startEditing() {
    if (!saved) return;
    setForm(saved.form);
    setError(null);
    setEditing(true);
  }

  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="label-mono">{formatDateLabel(today)}</span>
        <span className="label-mono">Check-in</span>
      </div>

      <h1 className="mt-10 mb-8 font-serif text-[46px] leading-[1.05] text-ink">
        How&apos;s the body <em>today?</em>
      </h1>

      {showForm ? (
        <>
          <Section index={1} title="Sleep">
            <div className="flex items-center justify-between">
              <RoundButton label="Half an hour less" onClick={() => set({ sleepHours: stepSleep(form.sleepHours, -1) })} disabled={form.sleepHours <= SLEEP_MIN}>
                <MinusIcon />
              </RoundButton>
              <div className="flex flex-col items-center gap-1" aria-live="polite">
                <span className="font-serif text-[72px] leading-none">{formatSleep(form.sleepHours)}</span>
                <span className="label-mono">Hours last night</span>
              </div>
              <RoundButton label="Half an hour more" onClick={() => set({ sleepHours: stepSleep(form.sleepHours, 1) })} disabled={form.sleepHours >= SLEEP_MAX}>
                <PlusIcon />
              </RoundButton>
            </div>
          </Section>

          <Section index={2} title="Energy">
            <PillGroup options={ENERGY_OPTIONS} value={form.energy as (typeof ENERGY_OPTIONS)[number]} onChange={(energy) => set({ energy })} numeric />
            <div className="flex justify-between">
              <span className="label-mono">Drained</span>
              <span className="label-mono">Great</span>
            </div>
          </Section>

          <Section index={3} title="Soreness">
            <div className="flex flex-wrap gap-2">
              {MUSCLES.map((m: Muscle) => {
                const level = form.soreness[m] ?? 0;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-label={`${titleCase(m)}, soreness ${level === 0 ? "none" : `${level} of 5`}. Tap to change.`}
                    onClick={() => set({ soreness: { ...form.soreness, [m]: nextSoreness(level) } })}
                    className={`${chipBase} ${SORENESS_STYLES[level]}`}
                  >
                    {titleCase(m)}
                    {level > 0 && <span className="font-mono text-[10.5px]">{level}</span>}
                  </button>
                );
              })}
            </div>
            <p className="label-mono">Tap a sore muscle. Tap again for more.</p>
          </Section>

          <Section index={4} title="Pain">
            <PillGroup
              options={["no", "yes"] as const}
              value={form.hasPain ? "yes" : "no"}
              onChange={(v) => set({ hasPain: v === "yes" })}
              labels={{ no: "No", yes: "Yes" }}
            />
            {form.hasPain && (
              <>
                <div className="flex flex-wrap gap-2">
                  {PAIN_AREAS.map((a: PainArea) => {
                    const on = form.painAreas.includes(a);
                    return (
                      <button
                        key={a}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ painAreas: togglePainArea(form.painAreas, a) })}
                        className={`${chipBase} ${on ? "border-ink bg-ink text-paper" : "border-hairline text-ink"}`}
                      >
                        {titleCase(a)}
                      </button>
                    );
                  })}
                </div>
                <p className="rounded-row bg-red-tint px-4 py-3 text-sm leading-snug text-red-text">{PAIN_MESSAGE}</p>
              </>
            )}
          </Section>

          <Section index={5} title="Time">
            <PillGroup
              options={SESSION_MINUTES_OPTIONS}
              value={form.minutesAvailable as (typeof SESSION_MINUTES_OPTIONS)[number]}
              onChange={(minutesAvailable) => set({ minutesAvailable })}
              numeric
            />
            <span className="label-mono">Minutes available</span>
          </Section>

          <Section index={6} title="Note">
            <Field
              label="Anything else? Optional"
              value={form.note}
              maxLength={NOTE_MAX_LENGTH}
              placeholder="e.g. slept badly, left knee feels tight"
              onChange={(e) => set({ note: e.target.value })}
            />
          </Section>
        </>
      ) : (
        saved && <Summary saved={saved} />
      )}

      <div className="mt-4 flex flex-col gap-3">
        {showForm ? (
          <ReadinessCard level={live.level} label={live.label} line={live.line} tags={live.tags} />
        ) : (
          saved && <ReadinessCard {...readinessDisplay(saved.readiness)} />
        )}

        {error && <ErrorText>{error}</ErrorText>}

        {showForm ? (
          <>
            <PrimaryButton type="button" onClick={submit} disabled={isPending} className="mt-3">
              {isPending ? "Saving…" : saved ? "Update check-in" : "Save check-in"}
            </PrimaryButton>
            {saved && (
              <SecondaryButton type="button" onClick={() => setEditing(false)}>
                Cancel
              </SecondaryButton>
            )}
          </>
        ) : isBuilding ? (
          <div className="mt-3">
            <WorkingState hint="A few seconds">Building your session…</WorkingState>
          </div>
        ) : (
          <>
            {hasSession ? (
              <PrimaryButton type="button" onClick={() => router.push(sessionHref)} className="mt-3">
                View today&apos;s session
              </PrimaryButton>
            ) : (
              <PrimaryButton type="button" onClick={build} className="mt-3">
                Build my session
              </PrimaryButton>
            )}
            <SecondaryButton type="button" onClick={startEditing}>
              Edit check-in
            </SecondaryButton>
          </>
        )}
      </div>
    </>
  );
}
