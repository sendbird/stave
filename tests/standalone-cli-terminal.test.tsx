import { describe, expect, test } from "bun:test";
import { buildStandaloneCliCreateSessionArgs } from "@/components/layout/standalone-cli/StandaloneCliTerminal";
import { buildCliTerminalRestartToken } from "@/components/layout/useCliTerminalInstance";
import {
  getStandaloneCliTabKey,
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

describe("buildCliTerminalRestartToken", () => {
  // Every CLI surface keys its mount div by the active tab, so React throws the
  // DOM subtree away on a tab switch. The renderer hook only rebuilds xterm
  // when its restartToken changes, so the token has to move with the tab or the
  // viewport stays permanently blank. Folding the tab in lives in the shared
  // hook so the docked CLI panel gets the same guarantee as the overlay.
  test("changes when the active tab changes", () => {
    expect(
      buildCliTerminalRestartToken({
        instanceKey: getStandaloneCliTabKey("claude-code"),
        restartToken: 0,
      }),
    ).not.toBe(
      buildCliTerminalRestartToken({
        instanceKey: getStandaloneCliTabKey("codex"),
        restartToken: 0,
      }),
    );
  });

  test("changes when the manual restart counter changes", () => {
    expect(
      buildCliTerminalRestartToken({
        instanceKey: "cli:codex",
        restartToken: 0,
      }),
    ).not.toBe(
      buildCliTerminalRestartToken({
        instanceKey: "cli:codex",
        restartToken: 1,
      }),
    );
  });

  test("never collides across (counter, tab) pairs", () => {
    const tokens = new Set<string>();
    for (let restartToken = 0; restartToken < 25; restartToken += 1) {
      for (const tabId of STANDALONE_CLI_TAB_IDS) {
        tokens.add(
          buildCliTerminalRestartToken({
            instanceKey: getStandaloneCliTabKey(tabId),
            restartToken,
          }),
        );
      }
    }

    expect(tokens.size).toBe(25 * STANDALONE_CLI_TAB_IDS.length);
  });

  test("cannot alias a tab key that already ends in the counter separator", () => {
    // A naive `${key}:${count}` join lets ("a:1", 2) and ("a", "1:2") collide.
    expect(
      buildCliTerminalRestartToken({ instanceKey: "a:1", restartToken: 2 }),
    ).not.toBe(
      buildCliTerminalRestartToken({ instanceKey: "a", restartToken: 12 }),
    );
  });
});
