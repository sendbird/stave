import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CLAUDE_CLI_AUTO_MODE_MIN_VERSION,
  isClaudeCliAutoModeSupportedVersion,
} from "../electron/providers/claude-cli-compat";
import {
  applyConfiguredMcpEnvOverrides,
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

describe("applyConfiguredMcpEnvOverrides", () => {
  test("fills only missing variables referenced by configured MCPs", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "stave-mcp-env-"));
    const configPath = path.join(directory, "config.toml");
    writeFileSync(
      configPath,
      '[mcp_servers.remote]\nbearer_token_env_var = "MCP_TOKEN"\nenv_vars = ["OTHER_TOKEN"]\n',
      "utf8",
    );
    const env: Record<string, string | undefined> = {
      EXISTING_TOKEN: "inherited-token",
    };
    const resolvedKeys: string[] = [];

    try {
      applyConfiguredMcpEnvOverrides({
        env,
        provider: "codex",
        configPaths: [configPath],
        resolver: ({ key }) => {
          resolvedKeys.push(key);
          return "shell-token";
        },
      });

      expect(env).toMatchObject({
        EXISTING_TOKEN: "inherited-token",
        MCP_TOKEN: "shell-token",
        OTHER_TOKEN: "shell-token",
      });
      expect(resolvedKeys).toEqual(["MCP_TOKEN", "OTHER_TOKEN"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("does not overwrite an inherited MCP credential", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "stave-mcp-env-"));
    const configPath = path.join(directory, "config.toml");
    writeFileSync(
      configPath,
      '[mcp_servers.remote]\nbearer_token_env_var = "MCP_TOKEN"\n',
      "utf8",
    );
    const env: Record<string, string | undefined> = {
      MCP_TOKEN: "inherited-token",
    };
    const resolvedKeys: string[] = [];

    try {
      applyConfiguredMcpEnvOverrides({
        env,
        provider: "codex",
        configPaths: [configPath],
        resolver: ({ key }) => {
          resolvedKeys.push(key);
          return "shell-token";
        },
      });

      expect(env.MCP_TOKEN).toBe("inherited-token");
      expect(resolvedKeys).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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
