import { beforeEach, describe, expect, test } from "bun:test";
import {
  selectScratchPendingApprovals,
  useScratchSessionStore,
} from "../src/store/scratch-session.store";
import { defaultSettings } from "@/store/app-settings";
import type { NormalizedProviderEvent } from "../src/lib/providers/provider.types";

beforeEach(() => {
  useScratchSessionStore.getState().reset();
});

describe("scratch session folder guard", () => {
  test("stores an absolute directory path", () => {
    const result = useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/downloads" });

    expect(result.ok).toBe(true);
    expect(useScratchSessionStore.getState().folderPath).toBe("/tmp/downloads");
    expect(useScratchSessionStore.getState().error).toBeNull();
  });

  test("rejects a relative path", () => {
    const result = useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "./relative" });

    expect(result.ok).toBe(false);
    expect(useScratchSessionStore.getState().folderPath).toBeNull();
    expect(useScratchSessionStore.getState().error).toBe(
      "Scratch sessions need an absolute folder path.",
    );
  });

  test("adopts the folder the directory picker returned", async () => {
    const result = await useScratchSessionStore.getState().pickFolder({
      pickDirectory: async () => ({ ok: true, directoryPath: "/tmp/picked" }),
    });

    expect(result.ok).toBe(true);
    expect(useScratchSessionStore.getState().folderPath).toBe("/tmp/picked");
  });

  test("keeps the previous folder when the picker is cancelled", async () => {
    useScratchSessionStore.getState().setFolder({ directoryPath: "/tmp/kept" });

    const result = await useScratchSessionStore.getState().pickFolder({
      pickDirectory: async () => ({ ok: false, stderr: "No folder selected." }),
    });

    expect(result.ok).toBe(false);
    expect(useScratchSessionStore.getState().folderPath).toBe("/tmp/kept");
  });

  test("issues a distinct task id per session", () => {
    const first = useScratchSessionStore.getState().taskId;
    useScratchSessionStore.getState().reset();
    expect(useScratchSessionStore.getState().taskId).not.toBe(first);
    expect(first.startsWith("scratch-")).toBe(true);
  });
});

function buildFakeRunTurn(events: NormalizedProviderEvent[]) {
  const calls: Array<Record<string, unknown>> = [];
  const runTurn = (args: Record<string, unknown>) => {
    calls.push(args);
    return (async function* () {
      for (const event of events) {
        yield event;
      }
    })();
  };
  return { calls, runTurn };
}

describe("scratch session turn dispatch", () => {
  test("passes cwd and omits workspaceId", async () => {
    const { calls, runTurn } = buildFakeRunTurn([
      { type: "text", text: "hello" },
      { type: "done" },
    ]);

    useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/scratch" });
    await useScratchSessionStore
      .getState()
      .send(
        { prompt: "what is here?", settings: defaultSettings },
        { runTurn },
      );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.cwd).toBe("/tmp/scratch");
    // `runProviderTurn` forwards the key unconditionally
    // (src/store/provider-turn-runtime.ts:36), so assert the VALUE is absent —
    // not the key. What matters is that no workspace binding reaches the runtime.
    expect(calls[0]?.workspaceId).toBeUndefined();
    expect(calls[0]?.taskId).toBe(useScratchSessionStore.getState().taskId);
  });

  test("refuses to start a turn without a folder", async () => {
    const { calls, runTurn } = buildFakeRunTurn([{ type: "done" }]);

    await useScratchSessionStore
      .getState()
      .send({ prompt: "anything", settings: defaultSettings }, { runTurn });

    expect(calls).toHaveLength(0);
    expect(useScratchSessionStore.getState().error).toBe(
      "Pick a folder before sending a message.",
    );
  });

  test("seeds a user message and a streaming assistant message", async () => {
    const { runTurn } = buildFakeRunTurn([{ type: "done" }]);

    useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/scratch" });
    await useScratchSessionStore
      .getState()
      .send({ prompt: "hi", settings: defaultSettings }, { runTurn });

    const messages = useScratchSessionStore.getState().messages;
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toBe("hi");
    expect(messages[1]?.role).toBe("assistant");
  });

  test("disables the advisor on every scratch turn", async () => {
    const { calls, runTurn } = buildFakeRunTurn([{ type: "done" }]);

    useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/scratch" });
    await useScratchSessionStore
      .getState()
      .send({ prompt: "hi", settings: defaultSettings }, { runTurn });

    const runtimeOptions = (calls[0]?.runtimeOptions ?? {}) as Record<
      string,
      unknown
    >;
    expect("advisorTarget" in runtimeOptions).toBe(false);
    expect("workerIntent" in runtimeOptions).toBe(false);
  });
});

describe("scratch session event folding", () => {
  test("folds streamed text into the assistant message and clears the turn on done", async () => {
    const { runTurn } = buildFakeRunTurn([
      { type: "text", text: "the folder holds a rust crate" },
      { type: "done" },
    ]);

    useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/scratch" });
    await useScratchSessionStore
      .getState()
      .send(
        { prompt: "what is here?", settings: defaultSettings },
        { runTurn },
      );
    await Bun.sleep(0);

    const messages = useScratchSessionStore.getState().messages;
    const assistant = messages[messages.length - 1];
    expect(assistant?.content).toContain("rust crate");
    expect(useScratchSessionStore.getState().activeTurnId).toBeNull();
  });

  test("remembers the native session id and carries it into the next turn", async () => {
    const first = buildFakeRunTurn([
      {
        type: "provider_session",
        providerId: "claude-code",
        nativeSessionId: "session-abc",
      },
      { type: "done" },
    ]);

    useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/scratch" });
    await useScratchSessionStore
      .getState()
      .send(
        { prompt: "first", settings: defaultSettings },
        { runTurn: first.runTurn },
      );
    await Bun.sleep(0);

    expect(
      useScratchSessionStore.getState().providerSession["claude-code"],
    ).toBeDefined();

    const second = buildFakeRunTurn([{ type: "done" }]);
    await useScratchSessionStore
      .getState()
      .send(
        { prompt: "second", settings: defaultSettings },
        { runTurn: second.runTurn },
      );
    await Bun.sleep(0);

    expect(second.calls[0]?.runtimeOptions).toBeDefined();
    expect(useScratchSessionStore.getState().messages).toHaveLength(4);
  });
});

async function startTurnWithPendingApproval() {
  const runTurn = (_args: Record<string, unknown>) => {
    return (async function* () {
      yield {
        type: "approval" as const,
        toolName: "Edit",
        requestId: "req-1",
        description: "Rewrite README.md",
      };
      // Keep the turn alive by not ending the generator
      await new Promise(() => {}); // Never resolves
    })();
  };

  useScratchSessionStore
    .getState()
    .setFolder({ directoryPath: "/tmp/scratch" });
  await useScratchSessionStore
    .getState()
    .send(
      { prompt: "edit the readme", settings: defaultSettings },
      { runTurn },
    );
  await Bun.sleep(0);
}

describe("scratch session approvals", () => {
  test("exposes the pending approval", async () => {
    await startTurnWithPendingApproval();
    const pending = selectScratchPendingApprovals(
      useScratchSessionStore.getState(),
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]?.part.requestId).toBe("req-1");
  });

  test("responds with the live turn id and transitions the part", async () => {
    await startTurnWithPendingApproval();
    const turnId = useScratchSessionStore.getState().activeTurnId;
    const seen: Array<Record<string, unknown>> = [];

    await useScratchSessionStore.getState().respondApproval(
      { requestId: "req-1", approved: true },
      {
        respondApproval: async (args) => {
          seen.push(args);
          return { ok: true };
        },
      },
    );

    expect(seen[0]).toEqual({ turnId, requestId: "req-1", approved: true });
    expect(
      selectScratchPendingApprovals(useScratchSessionStore.getState()),
    ).toHaveLength(0);
  });

  test("keeps the approval pending and records the failure when delivery fails", async () => {
    await startTurnWithPendingApproval();

    await useScratchSessionStore
      .getState()
      .respondApproval(
        { requestId: "req-1", approved: true },
        { respondApproval: async () => ({ ok: false, message: "gone" }) },
      );

    expect(
      selectScratchPendingApprovals(useScratchSessionStore.getState()),
    ).toHaveLength(1);
    expect(useScratchSessionStore.getState().error).toContain("gone");
  });

  test("does not revert approval to responded if stop runs during IPC", async () => {
    await startTurnWithPendingApproval();
    const turnId = useScratchSessionStore.getState().activeTurnId;

    // Create a deferred respondApproval that won't resolve immediately
    let resolveApprovalCall: (value: { ok: boolean }) => void;
    const approvalPromise = new Promise<{ ok: boolean }>((resolve) => {
      resolveApprovalCall = resolve;
    });

    const respondApprovalCall = useScratchSessionStore
      .getState()
      .respondApproval(
        { requestId: "req-1", approved: true },
        { respondApproval: async () => approvalPromise },
      );

    // stop() runs while respondApproval is awaiting IPC
    await useScratchSessionStore.getState().stop({
      abortTurn: async () => ({ ok: true }),
    });

    // Verify turn is stopped
    expect(useScratchSessionStore.getState().activeTurnId).toBeNull();
    expect(
      selectScratchPendingApprovals(useScratchSessionStore.getState()),
    ).toHaveLength(0);

    // Now resolve the deferred respondApproval with success
    resolveApprovalCall!({ ok: true });
    await respondApprovalCall;

    // Approval should still be interrupted, not responded
    const approval = useScratchSessionStore.getState().messages
      .flatMap((m) => m.parts)
      .find((p) => p.type === "approval" && p.requestId === "req-1");
    expect(approval?.type === "approval" && approval?.state).not.toBe(
      "approval-responded",
    );
  });

  test("records error when respondApproval rejects", async () => {
    await startTurnWithPendingApproval();

    await useScratchSessionStore.getState().respondApproval(
      { requestId: "req-1", approved: true },
      {
        respondApproval: async () => {
          throw new Error("IPC crashed");
        },
      },
    );

    expect(useScratchSessionStore.getState().error).toContain("IPC crashed");
    expect(
      selectScratchPendingApprovals(useScratchSessionStore.getState()),
    ).toHaveLength(1);
  });
});

describe("scratch session stop", () => {
  test("aborts the live turn and interrupts pending approvals", async () => {
    await startTurnWithPendingApproval();
    const turnId = useScratchSessionStore.getState().activeTurnId;
    const aborted: Array<Record<string, unknown>> = [];

    await useScratchSessionStore.getState().stop({
      abortTurn: async (args) => {
        aborted.push(args);
        return { ok: true };
      },
    });

    expect(aborted[0]).toEqual({ turnId });
    expect(useScratchSessionStore.getState().activeTurnId).toBeNull();
    expect(
      selectScratchPendingApprovals(useScratchSessionStore.getState()),
    ).toHaveLength(0);
  });
});

describe("scratch session clear", () => {
  test("aborts, releases the provider task, and keeps the folder", async () => {
    await startTurnWithPendingApproval();
    const previousTaskId = useScratchSessionStore.getState().taskId;
    const turnId = useScratchSessionStore.getState().activeTurnId;
    const aborted: Array<Record<string, unknown>> = [];
    const cleaned: Array<Record<string, unknown>> = [];

    await useScratchSessionStore.getState().clear({
      abortTurn: async (args) => {
        aborted.push(args);
        return { ok: true };
      },
      cleanupTask: async (args) => {
        cleaned.push(args);
        return { ok: true };
      },
    });

    const state = useScratchSessionStore.getState();
    expect(aborted[0]).toEqual({ turnId });
    expect(cleaned[0]).toEqual({ taskId: previousTaskId });
    expect(state.messages).toEqual([]);
    expect(state.activeTurnId).toBeNull();
    expect(state.providerSession).toEqual({});
    expect(state.taskId).not.toBe(previousTaskId);
    expect(state.folderPath).toBe("/tmp/scratch");
  });

  test("ignores provider events that arrive after a clear", async () => {
    const { runTurn } = buildFakeRunTurn([]);
    useScratchSessionStore
      .getState()
      .setFolder({ directoryPath: "/tmp/scratch" });
    await useScratchSessionStore
      .getState()
      .send({ prompt: "hi", settings: defaultSettings }, { runTurn });
    const staleTurnId = useScratchSessionStore.getState().activeTurnId ?? "";

    await useScratchSessionStore.getState().clear({
      abortTurn: async () => ({ ok: true }),
      cleanupTask: async () => ({ ok: true }),
    });

    useScratchSessionStore.getState().ingestEvent({
      event: { type: "text", text: "late" },
      turnId: staleTurnId,
      provider: "claude-code",
      model: defaultSettings.modelClaude,
    });

    expect(useScratchSessionStore.getState().messages).toEqual([]);
  });
});
