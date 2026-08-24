import { beforeEach, describe, expect, test } from "bun:test";
import { useStandaloneCliStore } from "@/store/standalone-cli.store";
import {
  STANDALONE_CLI_SLOT_PREFIX,
  STANDALONE_CLI_TRANSCRIPT_STORAGE_KEY,
} from "@/lib/terminal/standalone-cli";

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

  test("does not adopt the new folder when the close IPC rejects", async () => {
    // The old PTYs are still alive in their slots, and createCliSession returns
    // an existing slot session while ignoring the new cwd. Committing here would
    // permanently show folder B while the CLI runs in folder A, so the change
    // has to stay unapplied and be retried instead.
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

    expect(useStandaloneCliStore.getState().adoptedFolderPath).toBe("/tmp/a");
    expect(useStandaloneCliStore.getState().nativeSessionIdByTab).toEqual({
      codex: "codex-1",
    });
  });

  test("does not adopt the new folder when the close IPC reports failure", async () => {
    const deps = { closeSessionsBySlotPrefix: async () => ({ ok: true }) };
    await useStandaloneCliStore.getState().adoptFolder({ folderPath: "/tmp/a" }, deps);

    await useStandaloneCliStore.getState().adoptFolder(
      { folderPath: "/tmp/b" },
      { closeSessionsBySlotPrefix: async () => ({ ok: false }) },
    );

    expect(useStandaloneCliStore.getState().adoptedFolderPath).toBe("/tmp/a");
  });

  test("drops the saved transcript when the folder changes", async () => {
    // The transcript is keyed by tab only, so without this removal the new
    // folder replays the previous folder's scrollback.
    const entries = new Map<string, string>();
    const globalWithWindow = globalThis as {
      window?: Record<string, unknown>;
    };
    const previousWindow = globalWithWindow.window;
    globalWithWindow.window = {
      ...(previousWindow ?? {}),
      localStorage: {
        getItem: (key: string) => entries.get(key) ?? null,
        setItem: (key: string, value: string) => {
          entries.set(key, value);
        },
        removeItem: (key: string) => {
          entries.delete(key);
        },
      },
    };

    try {
      const deps = { closeSessionsBySlotPrefix: async () => ({ ok: true }) };
      await useStandaloneCliStore
        .getState()
        .adoptFolder({ folderPath: "/tmp/a" }, deps);
      entries.set(
        STANDALONE_CLI_TRANSCRIPT_STORAGE_KEY,
        JSON.stringify({ "standalone-cli:codex": "old folder output" }),
      );

      await useStandaloneCliStore
        .getState()
        .adoptFolder({ folderPath: "/tmp/b" }, deps);

      expect(entries.has(STANDALONE_CLI_TRANSCRIPT_STORAGE_KEY)).toBe(false);
    } finally {
      if (previousWindow === undefined) {
        delete globalWithWindow.window;
      } else {
        globalWithWindow.window = previousWindow;
      }
    }
  });
});
