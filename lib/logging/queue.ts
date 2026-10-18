import type { LoggedSetRow } from "./types";

/**
 * A change waiting to reach the database. Sets are saved with an id made on the phone, so
 * sending the same upsert twice (a retry after a lost reply) still leaves one row.
 */
export type SyncOp =
  | { kind: "upsert"; set: LoggedSetRow }
  | { kind: "delete"; id: string; sessionId: string }
  | { kind: "skips"; sessionId: string; exerciseIds: string[] };

/** Where the queue lives between page loads (localStorage in the app, memory in tests). */
export type QueueStorage = { read(): string | null; write(value: string): void };

/** Sends one change; throws when it didn't make it (offline, server error). */
export type SyncSender = (op: SyncOp) => Promise<void>;

/** "saving" = first try in flight; "waiting" = a try failed, kept on the phone and retried; "saved" = in the database. */
export type SetSyncState = "saving" | "waiting" | "saved";

type Entry = { seq: number; op: SyncOp; failed: boolean };

export const STORAGE_KEY = "liftwise.sync.v1";

const opKey = (op: SyncOp) => (op.kind === "upsert" ? `set:${op.set.id}` : op.kind === "delete" ? `set:${op.id}` : `skips:${op.sessionId}`);

function parse(raw: string | null): Entry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.filter((e) => e && typeof e.seq === "number" && e.op && typeof e.op.kind === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Logged sets wait here, saved on the phone first, until the database has them. Changes are
 * sent one at a time, in order. A failed send stays in the queue for the next `flush`; nothing
 * is dropped until the server confirms it.
 */
export class SyncQueue {
  private entries: Entry[];
  private seq: number;
  private flushing: Promise<boolean> | null = null;
  private listeners = new Set<() => void>();
  /** Goes up on every change, for React's useSyncExternalStore. */
  version = 0;

  constructor(
    private storage: QueueStorage,
    private send: SyncSender,
  ) {
    this.entries = parse(storage.read());
    this.seq = Math.max(0, ...this.entries.map((e) => e.seq));
  }

  /** Waiting changes, oldest first. */
  ops(): SyncOp[] {
    return this.entries.map((e) => e.op);
  }

  get size() {
    return this.entries.length;
  }

  /** True when at least one waiting change has already failed once (we're probably offline). */
  get hasFailures() {
    return this.entries.some((e) => e.failed);
  }

  /**
   * Adds a change. A newer version of the same set (or the same session's skips) replaces the
   * waiting one in place; deleting a set drops its waiting save but still tells the server, in
   * case an earlier try got through without a reply.
   */
  enqueue(op: SyncOp) {
    const key = opKey(op);
    const entry: Entry = { seq: ++this.seq, op, failed: false };
    if (op.kind === "delete") {
      this.entries = [...this.entries.filter((e) => opKey(e.op) !== key), entry];
    } else {
      const i = this.entries.findIndex((e) => opKey(e.op) === key && e.op.kind === op.kind);
      if (i >= 0) this.entries = this.entries.map((e, j) => (j === i ? entry : e));
      else this.entries = [...this.entries, entry];
    }
    this.persist();
  }

  /** How a logged set is doing. */
  stateOf(setId: string): SetSyncState {
    const entry = this.entries.find((e) => e.op.kind === "upsert" && e.op.set.id === setId);
    if (!entry) return "saved";
    return entry.failed ? "waiting" : "saving";
  }

  /** Sends waiting changes in order. Resolves true when everything is saved. Only one runs at a time. */
  flush(): Promise<boolean> {
    if (!this.flushing) {
      this.flushing = this.run().finally(() => {
        this.flushing = null;
      });
    }
    return this.flushing;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async run(): Promise<boolean> {
    while (this.entries.length) {
      const entry = this.entries[0];
      try {
        await this.send(entry.op);
      } catch {
        this.entries = this.entries.map((e) => (e.seq === entry.seq ? { ...e, failed: true } : e));
        this.persist();
        return false;
      }
      // Remove exactly what was sent: if the set was edited meanwhile, its newer version stays.
      this.entries = this.entries.filter((e) => e.seq !== entry.seq);
      this.persist();
    }
    return true;
  }

  private persist() {
    this.version++;
    try {
      this.storage.write(JSON.stringify(this.entries));
    } catch {
      // Storage full or blocked: the queue still works in memory for this page.
    }
    for (const listener of this.listeners) listener();
  }
}

/** The session's sets as the phone sees them: the server's, with waiting saves and deletes applied. */
export function withPending(serverSets: LoggedSetRow[], ops: SyncOp[], sessionId: string): LoggedSetRow[] {
  const sets = new Map(serverSets.map((s) => [s.id, s]));
  for (const op of ops) {
    if (op.kind === "upsert" && op.set.session_id === sessionId) sets.set(op.set.id, op.set);
    if (op.kind === "delete" && op.sessionId === sessionId) sets.delete(op.id);
  }
  return [...sets.values()];
}

/** The session's skipped exercises: a waiting change wins over the server's copy. */
export function skipsWithPending(serverSkips: string[], ops: SyncOp[], sessionId: string): string[] {
  const pending = ops.findLast((op) => op.kind === "skips" && op.sessionId === sessionId);
  return pending && pending.kind === "skips" ? pending.exerciseIds : serverSkips;
}
