import { beforeEach, describe, expect, test } from "bun:test";
import { useScratchSessionStore } from "../src/store/scratch-session.store";
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
