import { beforeEach, describe, expect, test } from "bun:test";
import { useStandaloneCliStore } from "@/store/standalone-cli.store";
import { STANDALONE_CLI_SLOT_PREFIX } from "@/lib/terminal/standalone-cli";

beforeEach(() => {
  useStandaloneCliStore.getState().reset();
});

describe("standalone cli overlay visibility", () => {
  test("starts closed on claude code", () => {
    expect(useStandaloneCliStore.getState().open).toBe(false);
    expect(useStandaloneCliStore.getState().activeTabId).toBe("claude-code");
  });

  test("toggles open and closed", () => {
    useStandaloneCliStore.getState().toggleOverlay();
    expect(useStandaloneCliStore.getState().open).toBe(true);
    useStandaloneCliStore.getState().toggleOverlay();
    expect(useStandaloneCliStore.getState().open).toBe(false);
  });

  test("switches the active tab", () => {
    useStandaloneCliStore.getState().setActiveTab({ tabId: "codex" });
    expect(useStandaloneCliStore.getState().activeTabId).toBe("codex");
  });
});

describe("standalone cli native session ids", () => {
  test("records a native session id per tab", () => {
    useStandaloneCliStore
      .getState()
      .setTabNativeSession({ tabId: "codex", nativeSessionId: "codex-1" });

    expect(useStandaloneCliStore.getState().nativeSessionIdByTab).toEqual({
      codex: "codex-1",
    });
  });

  test("ignores blank ids and unknown tabs", () => {
    useStandaloneCliStore
      .getState()
      .setTabNativeSession({ tabId: "codex", nativeSessionId: "   " });
    useStandaloneCliStore
      .getState()
      .setTabNativeSession({ tabId: "not-a-tab", nativeSessionId: "x" });

    expect(useStandaloneCliStore.getState().nativeSessionIdByTab).toEqual({});
  });

  test("clears a native session id when the value is omitted", () => {
    useStandaloneCliStore
      .getState()
      .setTabNativeSession({ tabId: "claude-code", nativeSessionId: "claude-1" });
    useStandaloneCliStore.getState().setTabNativeSession({ tabId: "claude-code" });

    expect(useStandaloneCliStore.getState().nativeSessionIdByTab).toEqual({});
  });
});

describe("standalone cli folder adoption", () => {
  test("adopts an absolute folder and records it", async () => {
    const prefixes: string[] = [];
    await useStandaloneCliStore.getState().adoptFolder(
      { folderPath: "/tmp/notes" },
      {
        closeSessionsBySlotPrefix: async (args) => {
          prefixes.push(args.prefix);
          return { ok: true };
        },
      },
    );

    expect(useStandaloneCliStore.getState().adoptedFolderPath).toBe("/tmp/notes");
    // Nothing was running yet, but the teardown is unconditional so a stale
    // host slot from a previous app run cannot survive into the new folder.
    expect(prefixes).toEqual([STANDALONE_CLI_SLOT_PREFIX]);
  });

  test("closes sessions and clears native session ids when the folder changes", async () => {
    const prefixes: string[] = [];
    const deps = {
      closeSessionsBySlotPrefix: async (args: { prefix: string }) => {
        prefixes.push(args.prefix);
        return { ok: true };
      },
    };
    await useStandaloneCliStore.getState().adoptFolder({ folderPath: "/tmp/a" }, deps);
    useStandaloneCliStore
      .getState()
      .setTabNativeSession({ tabId: "claude-code", nativeSessionId: "claude-1" });

    await useStandaloneCliStore.getState().adoptFolder({ folderPath: "/tmp/b" }, deps);

    expect(useStandaloneCliStore.getState().adoptedFolderPath).toBe("/tmp/b");
    expect(useStandaloneCliStore.getState().nativeSessionIdByTab).toEqual({});
    expect(prefixes).toEqual([
      STANDALONE_CLI_SLOT_PREFIX,
      STANDALONE_CLI_SLOT_PREFIX,
    ]);
  });

  test("is a no-op when the folder is unchanged", async () => {
    let calls = 0;
    const deps = {
      closeSessionsBySlotPrefix: async () => {
        calls += 1;
        return { ok: true };
      },
    };
    await useStandaloneCliStore.getState().adoptFolder({ folderPath: "/tmp/a" }, deps);
    useStandaloneCliStore
      .getState()
      .setTabNativeSession({ tabId: "codex", nativeSessionId: "codex-1" });
    await useStandaloneCliStore.getState().adoptFolder({ folderPath: "/tmp/a" }, deps);

    expect(calls).toBe(1);
    expect(useStandaloneCliStore.getState().nativeSessionIdByTab).toEqual({
      codex: "codex-1",
    });
  });

  test("treats a blank folder as cleared and tears the sessions down", async () => {
    const deps = { closeSessionsBySlotPrefix: async () => ({ ok: true }) };
    await useStandaloneCliStore.getState().adoptFolder({ folderPath: "/tmp/a" }, deps);
    useStandaloneCliStore
      .getState()
      .setTabNativeSession({ tabId: "codex", nativeSessionId: "codex-1" });

    await useStandaloneCliStore.getState().adoptFolder({ folderPath: "   " }, deps);

    expect(useStandaloneCliStore.getState().adoptedFolderPath).toBeNull();
    expect(useStandaloneCliStore.getState().nativeSessionIdByTab).toEqual({});
  });

  test("still clears local state when the close IPC rejects", async () => {
    const deps = { closeSessionsBySlotPrefix: async () => ({ ok: true }) };
    await useStandaloneCliStore.getState().adoptFolder({ folderPath: "/tmp/a" }, deps);
    useStandaloneCliStore
      .getState()
      .setTabNativeSession({ tabId: "codex", nativeSessionId: "codex-1" });

    await useStandaloneCliStore.getState().adoptFolder(
      { folderPath: "/tmp/b" },
      {
        closeSessionsBySlotPrefix: async () => {
          throw new Error("bridge down");
        },
      },
    );

    expect(useStandaloneCliStore.getState().adoptedFolderPath).toBe("/tmp/b");
    expect(useStandaloneCliStore.getState().nativeSessionIdByTab).toEqual({});
  });
});
