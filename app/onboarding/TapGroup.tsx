"use client";

export function TapGroup<T extends string | number>({
  options,
  value,
  onChange,
  labels,
  numeric = false,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labels?: Partial<Record<T, string>>;
  /** Bigger, bolder digits for a value that's a number in its own right (Design: "numbers are the hero"). */
  numeric?: boolean;
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
            className={`min-h-14 min-w-14 flex-1 break-words rounded-2xl border px-2 py-3 text-center font-semibold leading-tight transition-colors ${
              numeric ? "text-xl font-bold" : "text-xs"
            } ${selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-foreground"}`}
          >
            {labels?.[option] ?? String(option)}
          </button>
        );
      })}
    </div>
  );
}
