import { afterEach, describe, expect, test } from "bun:test";
import {
  coalesceTarsReads, publishTarsSnapshot, readTarsSnapshot, subscribeTarsSnapshot, useTarsSnapshotStore,
} from "../src/store/tars-snapshot-store";
import type { TarsBridgeApi, TarsChangedEvent, TarsSnapshot } from "../src/lib/tars/types";

const AT = "2026-11-05T00:00:00.000Z";
const snapshot = (name: string): TarsSnapshot => ({
  identity: { id: "personal", name, instructions: "", updatedAt: AT }, responsibilities: [], pendingDecisions: [], runtime: "desktop",
});

interface Deferred { resolve: (value: TarsSnapshot) => void; reject: (error: unknown) => void }

/** A bridge whose reads resolve only when the test says so, in any order. */
function fakeBridge(options: { push?: boolean } = {}) {
  const reads: Deferred[] = [];
  const listeners = new Set<(event: TarsChangedEvent) => void>();
  let unsubscribed = 0;
  const bridge = {
    get: () => new Promise<TarsSnapshot>((resolve, reject) => { reads.push({ resolve, reject }); }),
    ...(options.push === false ? {} : {
      onChanged: (listener: (event: TarsChangedEvent) => void) => {
        listeners.add(listener);
        return () => { unsubscribed++; listeners.delete(listener); };
      },
    }),
  } as unknown as TarsBridgeApi;
  return {
    bridge, reads,
    emit: (scope: TarsChangedEvent["scope"]) => { for (const listener of listeners) listener({ scope }); },
    listenerCount: () => listeners.size,
    unsubscribed: () => unsubscribed,
  };
}
const settle = async () => { for (let index = 0; index < 5; index++) await Promise.resolve(); };
const current = () => useTarsSnapshotStore.getState().snapshot?.identity.name ?? null;

afterEach(() => { useTarsSnapshotStore.setState({ snapshot: null }); });

describe("coalesced Tars reads", () => {
  test("calls during a read share it and schedule exactly one trailing read", async () => {
    const resolvers: Array<() => void> = [];
    let reads = 0;
    const run = coalesceTarsReads(() => { reads++; return new Promise<void>((resolve) => { resolvers.push(resolve); }); });
    const first = run();
    expect(run()).toBe(first);
    void run(); void run();
    expect(reads).toBe(1);
    resolvers[0]!();
    await settle();
    expect(reads).toBe(2);
    resolvers[1]!();
    await settle();
    expect(reads).toBe(2);
    void run();
    expect(reads).toBe(3);
  });

  test("a failed read still lets the next call read", async () => {
    let reads = 0;
    const run = coalesceTarsReads(async () => { reads++; throw new Error("offline"); });
    await run();
    await run();
    expect(reads).toBe(2);
  });
});

describe("the app-wide Tars subscription", () => {
  test("reads once at start and again on snapshot changes, ignoring conversation changes", async () => {
    const f = fakeBridge();
    const stop = subscribeTarsSnapshot(f.bridge);
    expect(f.reads).toHaveLength(1);
    f.reads[0]!.resolve(snapshot("first"));
    await settle();
    expect(current()).toBe("first");
    f.emit("conversation");
    expect(f.reads).toHaveLength(1);
    f.emit("snapshot");
    expect(f.reads).toHaveLength(2);
    f.reads[1]!.resolve(snapshot("second"));
    await settle();
    expect(current()).toBe("second");
    stop();
  });

  test("a burst of changes costs one read in flight plus one trailing read, and the last state wins", async () => {
    const f = fakeBridge();
    const stop = subscribeTarsSnapshot(f.bridge);
    f.emit("snapshot"); f.emit("snapshot"); f.emit("snapshot");
    expect(f.reads).toHaveLength(1);
    f.reads[0]!.resolve(snapshot("before the burst ended"));
    await settle();
    expect(f.reads).toHaveLength(2);
    f.reads[1]!.resolve(snapshot("after the burst"));
    await settle();
    expect(f.reads).toHaveLength(2);
    expect(current()).toBe("after the burst");
    stop();
  });

  test("unsubscribing removes the listener and drops a pending trailing read", async () => {
    const f = fakeBridge();
    const stop = subscribeTarsSnapshot(f.bridge);
    expect(f.listenerCount()).toBe(1);
    f.emit("snapshot");
    stop();
    expect(f.unsubscribed()).toBe(1);
    expect(f.listenerCount()).toBe(0);
    f.reads[0]!.resolve(snapshot("first"));
    await settle();
    // The trailing read the event scheduled does not run after unsubscribing.
    expect(f.reads).toHaveLength(1);
    f.emit("snapshot");
    expect(f.reads).toHaveLength(1);
  });

  test("a bridge without change notifications still reads once", async () => {
    const f = fakeBridge({ push: false });
    const stop = subscribeTarsSnapshot(f.bridge);
    expect(f.reads).toHaveLength(1);
    f.reads[0]!.resolve(snapshot("preview"));
    await settle();
    expect(current()).toBe("preview");
    stop();
  });

  test("a change starts a fresh read instead of joining one that began before it", async () => {
    const f = fakeBridge();
    const mounted = readTarsSnapshot(f.bridge);
    const stop = subscribeTarsSnapshot(f.bridge);
    expect(f.reads).toHaveLength(2);
    // A plain mount read still joins the newest read in flight.
    expect(readTarsSnapshot(f.bridge)).not.toBe(mounted);
    expect(f.reads).toHaveLength(2);
    f.reads[1]!.resolve(snapshot("fresh"));
    f.reads[0]!.resolve(snapshot("stale"));
    await settle();
    expect(current()).toBe("fresh");
    stop();
  });
});

describe("stale reads never overwrite newer state", () => {
  test("a read that started before a command's result does not replace it", async () => {
    const f = fakeBridge();
    const read = readTarsSnapshot(f.bridge, { fresh: true });
    publishTarsSnapshot(snapshot("command result"));
    f.reads[0]!.resolve(snapshot("older read"));
    expect((await read).identity.name).toBe("older read");
    expect(current()).toBe("command result");
  });

  test("an older read that finishes last does not replace a newer read", async () => {
    const f = fakeBridge();
    void readTarsSnapshot(f.bridge, { fresh: true });
    void readTarsSnapshot(f.bridge, { fresh: true });
    f.reads[1]!.resolve(snapshot("newer"));
    await settle();
    f.reads[0]!.resolve(snapshot("older"));
    await settle();
    expect(current()).toBe("newer");
  });

  test("a read that starts after a command's result replaces it", async () => {
    const f = fakeBridge();
    publishTarsSnapshot(snapshot("command result"));
    void readTarsSnapshot(f.bridge, { fresh: true });
    f.reads[0]!.resolve(snapshot("later read"));
    await settle();
    expect(current()).toBe("later read");
  });
});
