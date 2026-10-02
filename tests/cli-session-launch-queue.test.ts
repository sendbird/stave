import { describe, expect, test } from "bun:test";
import { closeCliSessionsForRestart, createCliSessionLaunchQueue } from "@/components/layout/cli-session-launch-queue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("CLI launch and restart ordering", () => {
  test("account switch waits for a pending launch and its close before adopting a slot", async () => {
    const queue = createCliSessionLaunchQueue();
    const created = deferred();
    const closed = deferred();
    const closing = deferred();
    const calls: string[] = [];
    let slot: string | undefined;
    const oldLaunch = queue.run("claude", async (scope) => {
      calls.push("create:old-account");
      await created.promise;
      slot = "old-session";
      scope.rememberSession(slot);
      if (scope.isCurrent()) calls.push("persist-and-attach:old-session");
    });
    await Promise.resolve();
    const restart = queue.reset("claude", async (sessionId) => {
      calls.push(`close:${sessionId}`);
      closing.resolve();
      await closed.promise;
      slot = undefined;
    });
    const newLaunch = queue.run("claude", async () => {
      expect(slot).toBeUndefined();
      calls.push("create:new-account");
    });
    expect(calls).toEqual(["create:old-account"]);
    created.resolve();
    await closing.promise;
    expect(calls).toEqual(["create:old-account", "close:old-session"]);
    closed.resolve();
    await Promise.all([oldLaunch, restart, newLaunch]);
    expect(calls).toEqual(["create:old-account", "close:old-session", "create:new-account"]);
  });

  test("harmless effect replacement reuses one session without closing or spawning again", async () => {
    const queue = createCliSessionLaunchQueue();
    const created = deferred();
    let slot: string | undefined;
    let spawns = 0;
    let attached: string | undefined;
    const first = queue.run("codex", async (scope) => {
      spawns += 1;
      await created.promise;
      slot = "session-1";
      scope.rememberSession(slot);
    });
    await Promise.resolve();
    const replacement = queue.run("codex", async () => {
      if (!slot) spawns += 1;
      attached = slot;
    });
    created.resolve();
    await Promise.all([first, replacement]);
    expect(spawns).toBe(1);
    expect(attached).toBe("session-1");
  });

  test("repeated resets discard superseded launches and keep other tabs independent", async () => {
    const queue = createCliSessionLaunchQueue();
    const close = deferred();
    const calls: string[] = [];
    const firstReset = queue.reset("claude", () => close.promise);
    const superseded = queue.run("claude", async () => { calls.push("intermediate"); });
    const secondReset = queue.reset("claude", async () => {});
    const latest = queue.run("claude", async () => { calls.push("latest"); });
    await queue.run("codex", async () => { calls.push("other-tab"); });
    expect(calls).toEqual(["other-tab"]);
    close.resolve();
    await Promise.all([firstReset, superseded, secondReset, latest]);
    expect(calls).toEqual(["other-tab", "latest"]);
  });

  test("failed shutdown blocks adoption until a subsequent Restart succeeds", async () => {
    const queue = createCliSessionLaunchQueue();
    let launches = 0;
    await expect(queue.reset("claude", async () => { throw new Error("close failed"); })).rejects.toThrow("close failed");
    await expect(queue.run("claude", async () => { launches += 1; })).rejects.toThrow("close failed");
    expect(launches).toBe(0);
    await queue.reset("claude", async () => {});
    await queue.run("claude", async () => { launches += 1; });
    expect(launches).toBe(1);
  });
});

describe("closeCliSessionsForRestart", () => {
  test("closes both an unregistered pending launch and an existing host slot, once each", async () => {
    const closed: string[] = [];
    await closeCliSessionsForRestart({
      sessionIds: ["pending", "pending", null],
      slotKey: "cli:standalone-cli:claude-code",
      terminal: {
        getSlotState: async () => ({ state: "running", sessionId: "host-slot" }),
        closeSession: async ({ sessionId }) => { closed.push(sessionId); return { ok: true }; },
      },
    });
    expect(closed).toEqual(["pending", "host-slot"]);
  });

  test("surfaces a rejected shutdown instead of allowing account reuse", async () => {
    await expect(closeCliSessionsForRestart({
      sessionIds: ["old-session"],
      terminal: { closeSession: async () => ({ ok: false, stderr: "Unable to stop session" }) },
    })).rejects.toThrow("Unable to stop session");
  });

  test("can restart after the host has already removed an exited session", async () => {
    await closeCliSessionsForRestart({
      sessionIds: ["exited-session"],
      terminal: { closeSession: async () => ({ ok: false, stderr: "Terminal session not found." }) },
    });
  });
});
