import { describe, expect, test } from "bun:test";
import {
  CLAUDE_CLI_AUTO_MODE_MIN_VERSION,
  isClaudeCliAutoModeSupportedVersion,
} from "../electron/providers/claude-cli-compat";
import {
  applyLoginShellEnvOverrides,
  buildClaudeCliEnv,
} from "../electron/providers/cli-path-env";

describe("Claude CLI auto mode support", () => {
  test("requires Claude Code 2.1.71 or newer", () => {
    expect(CLAUDE_CLI_AUTO_MODE_MIN_VERSION).toEqual({
      major: 2,
      minor: 1,
      patch: 71,
    });
    expect(
      isClaudeCliAutoModeSupportedVersion({
        version: { major: 2, minor: 1, patch: 70 },
      }),
    ).toBe(false);
    expect(
      isClaudeCliAutoModeSupportedVersion({
        version: { major: 2, minor: 1, patch: 71 },
      }),
    ).toBe(true);
    expect(
      isClaudeCliAutoModeSupportedVersion({
        version: { major: 2, minor: 1, patch: 105 },
      }),
    ).toBe(true);
  });

  test("treats unknown versions as unsupported", () => {
    expect(
      isClaudeCliAutoModeSupportedVersion({
        version: null,
      }),
    ).toBe(false);
  });
});

describe("applyLoginShellEnvOverrides", () => {
  test("prefers login-shell values over inherited env for preferred keys", () => {
    const env: Record<string, string | undefined> = {
      CLAUDE_CONFIG_DIR: "/stale/config",
    };

    applyLoginShellEnvOverrides({
      env,
      preferredKeys: ["CLAUDE_CONFIG_DIR"],
      resolver: ({ key }) =>
        key === "CLAUDE_CONFIG_DIR" ? "/fresh/config" : null,
    });

    expect(env.CLAUDE_CONFIG_DIR).toBe("/fresh/config");
  });

  test("fills fallback keys only when the env value is missing", () => {
    const env: Record<string, string | undefined> = {
      SLACK_OAUTH_TOKEN: "existing-token",
    };

    applyLoginShellEnvOverrides({
      env,
      fallbackKeys: ["SLACK_OAUTH_TOKEN", "CODEX_HOME"],
      resolver: ({ key }) => {
        if (key === "SLACK_OAUTH_TOKEN") {
          return "shell-token";
        }
        if (key === "CODEX_HOME") {
          return "/shell/codex";
        }
        return null;
      },
    });

    expect(env.SLACK_OAUTH_TOKEN).toBe("existing-token");
    expect(env.CODEX_HOME).toBe("/shell/codex");
  });
});

describe("buildClaudeCliEnv", () => {
  test("does not force a default Claude config dir when none is exported", () => {
    const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;

    try {
      const env = buildClaudeCliEnv({
        executablePath: "/tmp/claude",
        resolver: () => null,
      });

      expect(env.CLAUDE_CONFIG_DIR).toBeUndefined();
    } finally {
      if (typeof originalConfigDir === "string") {
        process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
      } else {
        delete process.env.CLAUDE_CONFIG_DIR;
      }
    }
  });
});
