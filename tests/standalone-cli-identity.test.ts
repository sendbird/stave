import { describe, expect, test } from "bun:test";
import {
  buildStandaloneCliSlotKey,
  buildStandaloneCliTabs,
  getStandaloneCliTabKey,
  getStandaloneCliTabTitle,
  STANDALONE_CLI_SLOT_PREFIX,
  STANDALONE_CLI_TAB_IDS,
  STANDALONE_CLI_WORKSPACE_ID,
} from "@/lib/terminal/standalone-cli";
import { buildTerminalSessionSlotKey } from "@/lib/terminal/types";

describe("standalone cli identity", () => {
  test("uses a sentinel workspace id that cannot collide with real ids", () => {
    // Real workspace ids are only "", "base", "base:<hash>" and
    // "worktree:<hash>", and the hash alphabet is [0-9a-z].
    expect(STANDALONE_CLI_WORKSPACE_ID).toBe("standalone-cli");
    expect(STANDALONE_CLI_WORKSPACE_ID).not.toBe("");
    expect(STANDALONE_CLI_WORKSPACE_ID.startsWith("base")).toBe(false);
    expect(STANDALONE_CLI_WORKSPACE_ID.startsWith("worktree")).toBe(false);
  });

  test("slot keys come from the shared builder", () => {
    for (const tabId of STANDALONE_CLI_TAB_IDS) {
      expect(buildStandaloneCliSlotKey(tabId)).toBe(
        buildTerminalSessionSlotKey({
          surface: "cli",
          workspaceId: STANDALONE_CLI_WORKSPACE_ID,
          tabId,
        }),
      );
    }
  });

  test("the slot prefix does not collide with workspace cleanup prefixes", () => {
    const workspaceCleanupPrefixes = ["", "base", "base:1x2y3z", "worktree:9ab7c"].map(
      (workspaceId) =>
        buildTerminalSessionSlotKey({ surface: "cli", workspaceId, tabId: "" }),
    );
    for (const prefix of workspaceCleanupPrefixes) {
      expect(STANDALONE_CLI_SLOT_PREFIX.startsWith(prefix)).toBe(false);
      expect(prefix.startsWith(STANDALONE_CLI_SLOT_PREFIX)).toBe(false);
    }
  });

  test("every slot key starts with the slot prefix", () => {
    for (const tabId of STANDALONE_CLI_TAB_IDS) {
      expect(buildStandaloneCliSlotKey(tabId).startsWith(STANDALONE_CLI_SLOT_PREFIX)).toBe(
        true,
      );
    }
  });

  test("tab keys are prefixed by the sentinel workspace id", () => {
    // useCliSessionManager prefix-matches tab keys on `${workspaceId}:`;
    // breaking this leaks PTYs silently.
    for (const tabId of STANDALONE_CLI_TAB_IDS) {
      expect(
        getStandaloneCliTabKey(tabId).startsWith(`${STANDALONE_CLI_WORKSPACE_ID}:`),
      ).toBe(true);
    }
  });

  test("exposes a display title per tab", () => {
    expect(getStandaloneCliTabTitle("claude-code")).toBe("Claude Code");
    expect(getStandaloneCliTabTitle("codex")).toBe("Codex");
  });

  test("builds one tab per provider carrying the folder as cwd", () => {
    const tabs = buildStandaloneCliTabs({
      folderPath: "/tmp/notes",
      nativeSessionIdByTab: { codex: "codex-session-1" },
    });

    expect(tabs.map((tab) => tab.id)).toEqual(["claude-code", "codex"]);
    expect(tabs.every((tab) => tab.cwd === "/tmp/notes")).toBe(true);
    expect(tabs[0].nativeSessionId).toBeUndefined();
    expect(tabs[1].nativeSessionId).toBe("codex-session-1");
    expect(tabs.map((tab) => tab.title)).toEqual(["Claude Code", "Codex"]);
  });
});
