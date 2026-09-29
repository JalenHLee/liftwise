import type { ComponentProps, ReactNode } from "react";

/** "Lift" + italic terracotta "wise". */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-serif leading-none tracking-[-0.02em] ${className}`}>
      Lift<em className="text-accent">wise</em>
    </span>
  );
}

/** Numbered mono section label, e.g. "01  SLEEP". */
export function SectionLabel({ index, children }: { index?: number; children: ReactNode }) {
  return (
    <span className="label-mono whitespace-pre">
      {index !== undefined ? `${String(index).padStart(2, "0")}  ` : ""}
      {children}
    </span>
  );
}

function ArrowIcon() {
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" fill="none" aria-hidden="true">
      <path d="M0 6h20.5M15.5 1l5 5-5 5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Ink pill, 54px tall: label on the left, thin arrow on the right (or a small mono `hint`, e.g. "Coming soon"). */
export function PrimaryButton({
  children,
  hint,
  className = "",
  ...props
}: ComponentProps<"button"> & { hint?: ReactNode }) {
  return (
    <button
      {...props}
      className={`flex h-[54px] w-full items-center justify-between rounded-full bg-ink px-7 text-base font-medium text-paper transition-opacity disabled:opacity-60 ${className}`}
    >
      <span>{children}</span>
      {hint ? (
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em]">{hint}</span>
      ) : (
        <ArrowIcon />
      )}
    </button>
  );
}

/** Hairline-outline pill for secondary actions. */
export function SecondaryButton({ children, className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={`flex min-h-12 w-full items-center justify-center rounded-full border border-hairline px-7 text-base font-medium text-ink ${className}`}
    >
      {children}
    </button>
  );
}

/** No box, just a 1px hairline underline, with a mono label above. */
export function Field({
  label,
  className = "",
  ...inputProps
}: { label: ReactNode } & ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-mono">{label}</span>
      <input
        {...inputProps}
        className={`min-h-11 border-0 border-b border-hairline bg-transparent py-2 text-lg text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-ink ${className}`}
      />
    </label>
  );
}

/** Single-choice pills. Selected = solid ink with paper text; unselected = hairline outline. */
export function PillGroup<T extends string | number>({
  options,
  value,
  onChange,
  labels,
  numeric = false,
  size = "md",
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labels?: Partial<Record<T, string>>;
  /** Show the options as serif numerals (e.g. days per week). */
  numeric?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((option) => {
        const selected = option === value;
        return (
          <button
            key={String(option)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
            className={`flex min-h-11 items-center justify-center rounded-full border px-4 leading-none transition-colors ${
              numeric ? "min-w-12 flex-1 font-serif text-[26px]" : size === "sm" ? "text-sm" : "text-[15px]"
            } ${selected ? "border-ink bg-ink text-paper" : "border-hairline text-ink"}`}
          >
            {labels?.[option] ?? String(option)}
          </button>
        );
      })}
    </div>
  );
}

/** Form error message. */
export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-red-text">
      {children}
    </p>
  );
}

const READINESS_STYLES = {
  green: { card: "bg-green-tint text-green-text", dot: "bg-green-dot" },
  yellow: { card: "bg-yellow-tint text-yellow-text", dot: "bg-yellow-dot" },
  red: { card: "bg-red-tint text-red-text", dot: "bg-red-dot" },
} as const;

/**
 * Soft tinted card: a small dot, a serif label ("Yellow day"), one line of explanation and the
 * reasons in mono. Always words as well as colour.
 */
export function ReadinessCard({
  level,
  label,
  line,
  tags,
}: {
  level: keyof typeof READINESS_STYLES;
  label: string;
  line: string;
  /** Short reasons, e.g. ["5.5h sleep", "sore quads"]; shown uppercase, joined with " · ". */
  tags: readonly string[];
}) {
  const style = READINESS_STYLES[level];
  return (
    <div role="status" className={`rounded-card px-6 py-6 ${style.card}`}>
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className={`size-2 rounded-full ${style.dot}`} />
        <span className="font-serif text-[32px] leading-none">{label}</span>
      </div>
      <p className="mt-3 text-[15px] leading-snug">{line}</p>
      <p className="mt-4 font-mono text-[10.5px] uppercase leading-relaxed tracking-[0.14em] opacity-80">
        {tags.length > 0 ? tags.join(" · ") : "No flags today"}
      </p>
    </div>
  );
}
