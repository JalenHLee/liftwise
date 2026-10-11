import { describe, expect, test } from "vitest";
import { skipsWithPending, SyncQueue, withPending, type QueueStorage, type SyncOp } from "./queue";
import type { LoggedSetRow } from "./types";

const set = (id: string, patch: Partial<LoggedSetRow> = {}): LoggedSetRow => ({
  id,
  session_id: "s1",
  exercise_id: "barbell-bench-press",
  set_number: 1,
  weight_kg: 60,
  reps: 8,
  rir: 2,
  logged_at: "2026-10-09T10:00:00Z",
  ...patch,
});

function memoryStorage(): QueueStorage & { value: string | null } {
  const s = { value: null as string | null, read: () => s.value, write: (v: string) => void (s.value = v) };
  return s;
}

/** A fake database: upserts by id (like the real one), plus an on/offline switch. */
function fakeServer() {
  const server = {
    online: true,
    rows: new Map<string, LoggedSetRow>(),
    skips: new Map<string, string[]>(),
    sent: [] as SyncOp[],
    send: async (op: SyncOp) => {
      if (!server.online) throw new Error("Failed to fetch");
      server.sent.push(op);
      if (op.kind === "upsert") server.rows.set(op.set.id, op.set);
      else if (op.kind === "delete") server.rows.delete(op.id);
      else server.skips.set(op.sessionId, op.exerciseIds);
    },
  };
  return server;
}

describe("logging a set", () => {
  test("is kept on the phone first, then saved", async () => {
    const storage = memoryStorage();
    const server = fakeServer();
    const q = new SyncQueue(storage, server.send);
    q.enqueue({ kind: "upsert", set: set("a") });
    expect(JSON.parse(storage.value!)).toHaveLength(1);
    expect(q.stateOf("a")).toBe("saving");
    expect(await q.flush()).toBe(true);
    expect(q.stateOf("a")).toBe("saved");
    expect(server.rows.get("a")).toEqual(set("a"));
    expect(JSON.parse(storage.value!)).toEqual([]);
  });

  test("tells listeners about changes", () => {
    const q = new SyncQueue(memoryStorage(), fakeServer().send);
    let calls = 0;
    q.subscribe(() => calls++);
    q.enqueue({ kind: "upsert", set: set("a") });
    expect(calls).toBe(1);
    expect(q.version).toBe(1);
  });
});

describe("offline: never lose a logged set", () => {
  test("a failed save stays on the phone, shows 'waiting', and goes through on retry", async () => {
    const server = fakeServer();
    server.online = false;
    const q = new SyncQueue(memoryStorage(), server.send);
    q.enqueue({ kind: "upsert", set: set("a") });
    q.enqueue({ kind: "upsert", set: set("b", { set_number: 2 }) });
    expect(await q.flush()).toBe(false);
    expect(q.stateOf("a")).toBe("waiting");
    expect(q.hasFailures).toBe(true);
    expect(q.size).toBe(2);

    server.online = true;
    expect(await q.flush()).toBe(true);
    expect([...server.rows.keys()]).toEqual(["a", "b"]);
    expect(q.stateOf("b")).toBe("saved");
  });

  test("survives a reload or a closed tab: a new queue picks up what was waiting", async () => {
    const storage = memoryStorage();
    const server = fakeServer();
    server.online = false;
    const first = new SyncQueue(storage, server.send);
    first.enqueue({ kind: "upsert", set: set("a") });
    await first.flush();

    server.online = true;
    const afterReload = new SyncQueue(storage, server.send);
    expect(afterReload.ops()).toEqual([{ kind: "upsert", set: set("a") }]);
    expect(await afterReload.flush()).toBe(true);
    expect(server.rows.has("a")).toBe(true);
  });

  test("a retry after a lost reply saves the set once, not twice (same id)", async () => {
    const server = fakeServer();
    let dropReply = true;
    const q = new SyncQueue(memoryStorage(), async (op) => {
      await server.send(op);
      if (dropReply) {
        dropReply = false;
        throw new Error("Network lost before the reply");
      }
    });
    q.enqueue({ kind: "upsert", set: set("a") });
    expect(await q.flush()).toBe(false);
    expect(await q.flush()).toBe(true);
    expect(server.sent).toHaveLength(2);
    expect(server.rows.size).toBe(1);
  });

  test("bad stored data doesn't crash the queue", () => {
    const storage = memoryStorage();
    storage.value = "{not json";
    expect(new SyncQueue(storage, fakeServer().send).size).toBe(0);
  });

  test("a full or blocked storage still keeps the set in memory and sends it", async () => {
    const server = fakeServer();
    const q = new SyncQueue({ read: () => null, write: () => { throw new Error("QuotaExceeded"); } }, server.send);
    q.enqueue({ kind: "upsert", set: set("a") });
    expect(await q.flush()).toBe(true);
    expect(server.rows.has("a")).toBe(true);
  });

  test("only one flush runs at a time", async () => {
    const server = fakeServer();
    const q = new SyncQueue(memoryStorage(), server.send);
    q.enqueue({ kind: "upsert", set: set("a") });
    await Promise.all([q.flush(), q.flush(), q.flush()]);
    expect(server.sent).toHaveLength(1);
  });
});

describe("correcting and deleting sets", () => {
  test("correcting a waiting set replaces it, so only the latest version is sent", async () => {
    const server = fakeServer();
    const q = new SyncQueue(memoryStorage(), server.send);
    q.enqueue({ kind: "upsert", set: set("a") });
    q.enqueue({ kind: "upsert", set: set("a", { weight_kg: 62.5 }) });
    expect(q.size).toBe(1);
    await q.flush();
    expect(server.sent).toHaveLength(1);
    expect(server.rows.get("a")!.weight_kg).toBe(62.5);
  });

  test("a correction made while the first save is in flight isn't lost", async () => {
    const server = fakeServer();
    let release!: () => void;
    let first = true;
    const q = new SyncQueue(memoryStorage(), async (op) => {
      if (first) {
        first = false;
        await new Promise<void>((r) => (release = r));
      }
      await server.send(op);
    });
    q.enqueue({ kind: "upsert", set: set("a") });
    const flushing = q.flush();
    q.enqueue({ kind: "upsert", set: set("a", { reps: 10 }) });
    release();
    await flushing;
    await q.flush();
    expect(server.rows.get("a")!.reps).toBe(10);
    expect(q.size).toBe(0);
  });

  test("deleting drops the waiting save and still tells the server", async () => {
    const server = fakeServer();
    server.rows.set("a", set("a"));
    const q = new SyncQueue(memoryStorage(), server.send);
    q.enqueue({ kind: "upsert", set: set("a", { reps: 3 }) });
    q.enqueue({ kind: "delete", id: "a", sessionId: "s1" });
    expect(q.ops()).toEqual([{ kind: "delete", id: "a", sessionId: "s1" }]);
    await q.flush();
    expect(server.rows.has("a")).toBe(false);
  });

  test("skips: the latest list wins", async () => {
    const server = fakeServer();
    const q = new SyncQueue(memoryStorage(), server.send);
    q.enqueue({ kind: "skips", sessionId: "s1", exerciseIds: ["cable-fly"] });
    q.enqueue({ kind: "skips", sessionId: "s1", exerciseIds: [] });
    expect(q.size).toBe(1);
    await q.flush();
    expect(server.skips.get("s1")).toEqual([]);
  });
});

describe("what the phone shows", () => {
  test("server sets with waiting saves and deletes applied, for this session only", () => {
    const server = [set("a"), set("b", { set_number: 2 })];
    const ops: SyncOp[] = [
      { kind: "upsert", set: set("a", { reps: 9 }) },
      { kind: "delete", id: "b", sessionId: "s1" },
      { kind: "upsert", set: set("c", { set_number: 3 }) },
      { kind: "upsert", set: set("z", { session_id: "other" }) },
    ];
    expect(withPending(server, ops, "s1").map((s) => [s.id, s.reps])).toEqual([
      ["a", 9],
      ["c", 8],
    ]);
  });

  test("a waiting skip list wins over the server's", () => {
    expect(skipsWithPending(["x"], [], "s1")).toEqual(["x"]);
    expect(skipsWithPending(["x"], [{ kind: "skips", sessionId: "s1", exerciseIds: ["y"] }], "s1")).toEqual(["y"]);
  });
});
