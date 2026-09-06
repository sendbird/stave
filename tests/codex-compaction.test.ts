import { describe, expect, test } from "bun:test";
import {
  runCodexCompactSlashCommand,
  isCodexCompactSlashCommand,
} from "../electron/providers/codex-compaction";
import { resolveHostServiceRequestTimeoutMs } from "../electron/main/host-service-request-timeouts";
import { requireCompactResumeSession } from "@/lib/providers/native-compaction";
import type { BridgeEvent } from "../electron/providers/types";

function harness() {
  type Message = { method?: string; params?: unknown; id?: string | number };
  const listeners = new Set<(message: Message) => void>();
  const exits = new Set<(message: string) => void>();
  const calls: { method: string; params: unknown }[] = [];
  const client = {
    async request<T = unknown>(method: string, params: unknown): Promise<T> {
      calls.push({ method, params });
      return {} as T;
    },
    subscribe(listener: (message: Message) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onProcessExit(listener: (message: string) => void) {
      exits.add(listener);
      return () => {
        exits.delete(listener);
      };
    },
  };
  const notify = (method: string, params: unknown) =>
    listeners.forEach((listener) => listener({ method, params }));
  return {
    client,
    calls,
    listeners,
    exits,
    notify,
    start: () =>
      notify("turn/started", { threadId: "thread-1", turn: { id: "turn-1" } }),
    compact: () =>
      notify("item/completed", {
        threadId: "thread-1",
        turnId: "turn-1",
        item: { type: "contextCompaction", id: "compact-1" },
      }),
    done: (status = "completed") =>
      notify("turn/completed", {
        threadId: "thread-1",
        turn: { id: "turn-1", status },
      }),
  };
}

describe("native compaction lifecycle", () => {
  test("the settings transport outlives native compaction", () => {
    expect(
      resolveHostServiceRequestTimeoutMs({
        method: "provider.compact-codex-thread",
      }),
    ).toBeGreaterThan(10 * 60_000);
  });
  test("rejects duplicate dispatch while native compaction is pending", async () => {
    const h = harness();
    const args = { client: h.client, threadId: "thread-1", input: "/compact" };
    const pending = runCodexCompactSlashCommand(args);
    const duplicate = await runCodexCompactSlashCommand(args);
    expect(duplicate?.[0]).toEqual(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("already in progress"),
      }),
    );
    expect(h.calls.length).toBe(1);
    h.start();
    h.compact();
    h.done();
    await pending;
  });
  test("recognizes compact and requires a resumable native session", () => {
    for (const input of [
      "/compact",
      " /Compact  ",
      "/compact focus on tests",
    ]) {
      expect(isCodexCompactSlashCommand(input)).toBe(true);
      expect(() => requireCompactResumeSession(input, null)).toThrow(
        "no resumable conversation",
      );
      expect(() =>
        requireCompactResumeSession(input, "existing"),
      ).not.toThrow();
    }
    for (const input of ["/compaction", "compact", "/goal compact"])
      expect(isCodexCompactSlashCommand(input)).toBe(false);
    expect(() => requireCompactResumeSession("Continue", null)).not.toThrow();
  });

  test("acknowledgement and unrelated notifications cannot report success", async () => {
    const h = harness();
    const progress: BridgeEvent[] = [];
    let settled = false;
    const promise = runCodexCompactSlashCommand({
      client: h.client,
      threadId: "thread-1",
      input: "/compact",
      onProgress: (event) => progress.push(event),
    });
    void promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    h.notify("turn/completed", {
      threadId: "other-thread",
      turn: { id: "other", status: "completed" },
    });
    h.start();
    h.notify("turn/completed", {
      threadId: "thread-1",
      turn: { id: "other-turn", status: "completed" },
    });
    h.compact();
    await Promise.resolve();
    expect(settled).toBe(false);
    h.done();
    expect(await promise).toEqual([
      {
        type: "system",
        content: "Context compacted (manual).",
        compactBoundary: { trigger: "manual" },
      },
      { type: "done" },
    ]);
    expect(progress).toEqual([
      { type: "system", content: "Compacting conversation context…" },
    ]);
    expect(h.calls).toEqual([
      { method: "thread/compact/start", params: { threadId: "thread-1" } },
    ]);
    expect(h.listeners.size + h.exits.size).toBe(0);
  });

  test("handles completion before acknowledgement", async () => {
    const h = harness();
    h.client.request = async <T>() => {
      h.start();
      h.compact();
      h.done();
      return {} as T;
    };
    const events = await runCodexCompactSlashCommand({
      client: h.client,
      threadId: "thread-1",
      input: "/compact",
    });
    expect(events?.[0]?.type).toBe("system");
    expect(h.listeners.size).toBe(0);
  });

  test.each(["failed", "completed"])(
    "does not claim compaction without evidence: %s",
    async (status) => {
      const h = harness();
      const promise = runCodexCompactSlashCommand({
        client: h.client,
        threadId: "thread-1",
        input: "/compact",
      });
      h.start();
      h.done(status);
      expect(await promise).toEqual([
        expect.objectContaining({ type: "error", recoverable: true }),
        { type: "done", stop_reason: "runtime_failure" },
      ]);
    },
  );

  test("an error after a completed item still fails the turn", async () => {
    const h = harness();
    const promise = runCodexCompactSlashCommand({
      client: h.client,
      threadId: "thread-1",
      input: "/compact",
    });
    h.start();
    h.compact();
    h.done("failed");
    expect((await promise)?.[0]?.type).toBe("error");
  });

  test("interrupts a turn that starts after cancellation", async () => {
    const h = harness();
    let abort!: () => void;
    const promise = runCodexCompactSlashCommand({
      client: h.client,
      threadId: "thread-1",
      input: "/compact",
      registerAbort: (fn) => {
        abort = fn;
      },
    });
    abort();
    h.start();
    h.compact();
    h.done();
    expect(await promise).toEqual([
      { type: "done", stop_reason: "user_abort" },
    ]);
    expect(h.calls.at(-1)).toEqual({
      method: "turn/interrupt",
      params: { threadId: "thread-1", turnId: "turn-1" },
    });
    expect(h.listeners.size + h.exits.size).toBe(0);
  });

  test("settles cancellation when the provider never starts a turn", async () => {
    const h = harness();
    let abort!: () => void;
    const promise = runCodexCompactSlashCommand({
      client: h.client,
      threadId: "thread-1",
      input: "/compact",
      interruptGraceMs: 1,
      registerAbort: (fn) => {
        abort = fn;
      },
    });
    abort();
    expect(await promise).toEqual([
      { type: "done", stop_reason: "user_abort" },
    ]);
    expect(h.listeners.size + h.exits.size).toBe(0);
  });

  test("times out and interrupts without reporting success", async () => {
    const h = harness();
    const promise = runCodexCompactSlashCommand({
      client: h.client,
      threadId: "thread-1",
      input: "/compact",
      timeoutMs: 1,
    });
    h.start();
    expect((await promise)?.[0]).toEqual(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("timeout"),
      }),
    );
    expect(h.calls.at(-1)?.method).toBe("turn/interrupt");
    expect(h.listeners.size + h.exits.size).toBe(0);
  });

  test("handles process exit and request rejection", async () => {
    const h = harness();
    const promise = runCodexCompactSlashCommand({
      client: h.client,
      threadId: "thread-1",
      input: "/compact",
    });
    h.exits.forEach((listener) => listener("process exited"));
    expect((await promise)?.[0]).toEqual(
      expect.objectContaining({
        type: "error",
        message: expect.stringContaining("process exited"),
      }),
    );
    h.client.request = async () => {
      throw new Error("request rejected");
    };
    expect(
      (
        await runCodexCompactSlashCommand({
          client: h.client,
          threadId: "thread-1",
          input: "/compact",
        })
      )?.[0]?.type,
    ).toBe("error");
    expect(h.listeners.size + h.exits.size).toBe(0);
  });

  test("does not dispatch normal input or silently discard custom instructions", async () => {
    const h = harness();
    expect(
      await runCodexCompactSlashCommand({
        client: h.client,
        threadId: "thread-1",
        input: "Continue",
      }),
    ).toBeNull();
    expect(
      (
        await runCodexCompactSlashCommand({
          client: h.client,
          threadId: "thread-1",
          input: "/compact preserve tests",
        })
      )?.[0]?.type,
    ).toBe("error");
    expect(h.calls).toEqual([]);
  });
});
