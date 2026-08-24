import { describe, expect, test } from "bun:test";
import {
  buildStandaloneCliCreateSessionArgs,
  STANDALONE_CLI_TRANSCRIPT_STORAGE_KEY,
} from "@/components/layout/standalone-cli/StandaloneCliTerminal";
import { STANDALONE_CLI_WORKSPACE_ID } from "@/lib/terminal/standalone-cli";

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
