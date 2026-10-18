"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_KEY, SyncQueue } from "@/lib/logging/queue";
import { supabaseSender } from "@/lib/logging/supabaseSender";

/** How often waiting sets are retried while any are waiting. */
export const RETRY_MS = 15_000;

let queue: SyncQueue | null = null;

/** The phone's one sync queue, kept in localStorage so a reload or a closed tab loses nothing. */
export function getQueue(): SyncQueue {
  if (!queue) {
    queue = new SyncQueue(
      {
        read: () => {
          try {
            return window.localStorage.getItem(STORAGE_KEY);
          } catch {
            return null;
          }
        },
        write: (value) => window.localStorage.setItem(STORAGE_KEY, value),
      },
      supabaseSender(createClient()),
    );
  }
  return queue;
}

const subscribe = (listener: () => void) => getQueue().subscribe(listener);
const getSnapshot = () => getQueue().version;
// The server has no queue: render nothing pending, then pick up the phone's queue after hydration.
const getServerSnapshot = () => -1;

/**
 * The sync queue for this page, re-rendering on every change, and retrying in the background:
 * straight away, every 15 seconds while anything waits, when the phone comes back online and
 * when the app returns to the foreground.
 */
export function useSyncQueue(): SyncQueue | null {
  const version = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = version !== -1;

  useEffect(() => {
    if (!ready) return;
    const q = getQueue();
    const flush = () => {
      if (q.size) void q.flush();
    };
    flush();
    const timer = window.setInterval(flush, RETRY_MS);
    const onVisible = () => document.visibilityState === "visible" && flush();
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready]);

  return ready ? getQueue() : null;
}
