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

/** Ink pill, 54px tall: label on the left, thin arrow on the right. */
export function PrimaryButton({ children, className = "", ...props }: ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={`flex h-[54px] w-full items-center justify-between rounded-full bg-ink px-7 text-base font-medium text-paper transition-opacity disabled:opacity-50 ${className}`}
    >
      <span>{children}</span>
      <ArrowIcon />
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
