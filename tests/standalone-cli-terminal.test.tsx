import { describe, expect, test } from "bun:test";
import {
  buildStandaloneCliCreateSessionArgs,
  buildStandaloneCliRendererKey,
} from "@/components/layout/standalone-cli/StandaloneCliTerminal";
import {
  STANDALONE_CLI_TAB_IDS,
  STANDALONE_CLI_TRANSCRIPT_STORAGE_KEY,
  STANDALONE_CLI_WORKSPACE_ID,
} from "@/lib/terminal/standalone-cli";

describe("buildStandaloneCliCreateSessionArgs", () => {
  const base = {
    folderPath: "/tmp/notes",
    cols: 120,
    rows: 40,
    deliveryMode: "push" as const,
    claudeBinaryPath: "",
    codexBinaryPath: "",
  };

  test("sends the sentinel workspace id and the folder as cwd and workspacePath", () => {
    const args = buildStandaloneCliCreateSessionArgs({
      ...base,
      tab: { id: "claude-code", title: "Claude Code", cwd: "/tmp/notes" },
    });

    expect(args.workspaceId).toBe(STANDALONE_CLI_WORKSPACE_ID);
    expect(args.cwd).toBe("/tmp/notes");
    expect(args.workspacePath).toBe("/tmp/notes");
    expect(args.cliSessionTabId).toBe("claude-code");
    expect(args.providerId).toBe("claude-code");
    expect(args.contextMode).toBe("workspace");
  });

  test("carries no task identity", () => {
    const args = buildStandaloneCliCreateSessionArgs({
      ...base,
      tab: { id: "codex", title: "Codex", cwd: "/tmp/notes" },
    });

    expect(args.taskId).toBeNull();
    expect(args.taskTitle).toBeNull();
  });

  test("passes a stored native session id through so the CLI resumes", () => {
    const args = buildStandaloneCliCreateSessionArgs({
      ...base,
      tab: {
        id: "codex",
        title: "Codex",
        cwd: "/tmp/notes",
        nativeSessionId: "codex-1",
      },
    });

    expect(args.nativeSessionId).toBe("codex-1");
  });

  test("forwards binary path overrides through the shared runtime options builder", () => {
    const args = buildStandaloneCliCreateSessionArgs({
      ...base,
      claudeBinaryPath: "/opt/claude",
      tab: { id: "claude-code", title: "Claude Code", cwd: "/tmp/notes" },
    });

    expect(args.runtimeOptions).toEqual({
      claudeBinaryPath: "/opt/claude",
      claudePermissionMode: "auto",
    });
  });

  test("uses a transcript key that no other surface shares", () => {
    expect(STANDALONE_CLI_TRANSCRIPT_STORAGE_KEY).toBe(
      "stave:standalone-cli-transcript:v1",
    );
    expect(STANDALONE_CLI_TRANSCRIPT_STORAGE_KEY).not.toBe(
      "stave:cli-session-transcript:v1",
    );
  });
});

describe("buildStandaloneCliRendererKey", () => {
  // The mount div is keyed by tab, so React throws its DOM subtree away on a
  // tab switch. The renderer hook only rebuilds xterm into the container when
  // its restartToken changes, so the token has to move with the tab or the
  // viewport stays permanently blank.
  test("changes when the active tab changes", () => {
    expect(
      buildStandaloneCliRendererKey({ restartCount: 0, tabId: "claude-code" }),
    ).not.toBe(
      buildStandaloneCliRendererKey({ restartCount: 0, tabId: "codex" }),
    );
  });

  test("changes when the manual restart counter changes", () => {
    expect(
      buildStandaloneCliRendererKey({ restartCount: 0, tabId: "codex" }),
    ).not.toBe(
      buildStandaloneCliRendererKey({ restartCount: 1, tabId: "codex" }),
    );
  });

  test("never collides across (counter, tab) pairs", () => {
    const keys = new Set<number>();
    for (let restartCount = 0; restartCount < 25; restartCount += 1) {
      for (const tabId of STANDALONE_CLI_TAB_IDS) {
        keys.add(buildStandaloneCliRendererKey({ restartCount, tabId }));
      }
    }

    expect(keys.size).toBe(25 * STANDALONE_CLI_TAB_IDS.length);
  });
});
