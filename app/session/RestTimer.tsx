"use client";

import { useEffect, useState } from "react";
import { clock, restExpired, restLeft, type Rest } from "@/lib/logging/rest";

/**
 * Calm rest bar pinned to the bottom: a big serif countdown, a thin progress hairline and Skip.
 * Starts on its own after a set is logged; shows "Rest done" briefly, then closes.
 */
export function RestTimer({ rest, onClose }: { rest: Rest; onClose: () => void }) {
  const [now, setNow] = useState(rest.startedAt);

  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (restExpired(rest, t)) onClose();
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [rest, onClose]);

  const left = restLeft(rest, now);
  const done = left === 0;
  // The hairline starts full width and shrinks to nothing as the rest runs out.
  const remaining = Math.max(0, 1 - (now - rest.startedAt) / (rest.seconds * 1000));

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-hairline bg-paper">
      <div aria-hidden="true" className="-mt-px h-px origin-left bg-ink transition-transform duration-300 ease-linear motion-reduce:transition-none" style={{ transform: `scaleX(${remaining})` }} />
      <div className="flex items-center justify-between gap-4 px-7 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="label-mono truncate">{done ? `Next · ${rest.next}` : `Rest · next ${rest.next}`}</span>
          <span role="timer" aria-live={done ? "polite" : "off"} className="font-serif text-[44px] leading-none text-ink tabular-nums">
            {done ? (
              <>
                Rest <em>done</em>
              </>
            ) : (
              clock(left)
            )}
          </span>
        </div>
        <button type="button" onClick={onClose} className="min-h-11 shrink-0 rounded-full border border-hairline px-6 text-[15px] text-ink">
          {done ? "Close" : "Skip"}
        </button>
      </div>
    </div>
  );
}
