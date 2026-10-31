import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { __resetExecutablePathCachesForTests } from "../electron/providers/executable-path";
import {
  CLAUDE_CLI_AUTO_MODE_MIN_VERSION,
  isClaudeCliAutoModeSupportedVersion,
} from "../electron/providers/claude-cli-compat";
import {
  applyConfiguredMcpEnvOverrides,
  applyLoginShellEnvOverrides,
  buildClaudeCliEnv,
  refreshMcpLoginShellEnv,
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
  test("does not inherit native plan tool flags from the parent process", () => {
    const originalTodoTools = process.env.CLAUDE_CODE_ENABLE_TODO_TOOLS;
    const originalTasks = process.env.CLAUDE_CODE_ENABLE_TASKS;
    process.env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "1";
    process.env.CLAUDE_CODE_ENABLE_TASKS = "1";

    try {
      const env = buildClaudeCliEnv({ executablePath: "/tmp/claude" });

      expect(env.CLAUDE_CODE_ENABLE_TODO_TOOLS).toBeUndefined();
      expect(env.CLAUDE_CODE_ENABLE_TASKS).toBeUndefined();
    } finally {
      if (originalTodoTools === undefined) delete process.env.CLAUDE_CODE_ENABLE_TODO_TOOLS;
      else process.env.CLAUDE_CODE_ENABLE_TODO_TOOLS = originalTodoTools;
      if (originalTasks === undefined) delete process.env.CLAUDE_CODE_ENABLE_TASKS;
      else process.env.CLAUDE_CODE_ENABLE_TASKS = originalTasks;
    }
  });

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

  test("applies a relocated Claude config dir from the login shell", () => {
    const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
    delete process.env.CLAUDE_CONFIG_DIR;

    try {
      const env = buildClaudeCliEnv({
        executablePath: "/tmp/claude",
        resolver: ({ key }) =>
          key === "CLAUDE_CONFIG_DIR" ? "/relocated/claude" : null,
      });

      expect(env.CLAUDE_CONFIG_DIR).toBe("/relocated/claude");
    } finally {
      if (typeof originalConfigDir === "string") {
        process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
      } else {
        delete process.env.CLAUDE_CONFIG_DIR;
      }
    }
  });
});

const PLUGIN_TOKEN_ENV_VAR = "STAVE_FIXTURE_PLUGIN_MCP_TOKEN";

/** A Claude config dir with one user-scope plugin whose MCP header needs a token. */
function makePluginEnvFixture(args: { enabled: boolean }) {
  const directory = mkdtempSync(path.join(tmpdir(), "stave-plugin-env-"));
  const configDir = path.join(directory, "claude-home");
  const cwd = path.join(directory, "workspace");
  const installPath = path.join(configDir, "plugins", "cache", "shop", "remote", "1.0.0");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(installPath, { recursive: true });
  writeFileSync(
    path.join(configDir, "plugins", "installed_plugins.json"),
    JSON.stringify({
      version: 2,
      plugins: { "remote@shop": [{ scope: "user", installPath }] },
    }),
  );
  writeFileSync(
    path.join(configDir, "settings.json"),
    JSON.stringify({ enabledPlugins: { "remote@shop": args.enabled } }),
  );
  writeFileSync(
    path.join(installPath, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        remote: {
          type: "http",
          url: "https://remote.example.test/mcp",
          headers: { Authorization: `Bearer \${${PLUGIN_TOKEN_ENV_VAR}}` },
        },
      },
    }),
  );
  return { directory, configDir, cwd };
}

describe("Claude plugin MCP env forwarding", () => {
  function shellResolver(configDir: string) {
    return ({ key }: { key: string }) =>
      key === "CLAUDE_CONFIG_DIR"
        ? configDir
        : key === PLUGIN_TOKEN_ENV_VAR
          ? "atl_test"
          : null;
  }

  test("forwards a login-shell token an enabled plugin's MCP header references", () => {
    const fixture = makePluginEnvFixture({ enabled: true });
    try {
      const env = buildClaudeCliEnv({
        executablePath: "/tmp/claude",
        cwd: fixture.cwd,
        resolver: shellResolver(fixture.configDir),
      });

      expect(env[PLUGIN_TOKEN_ENV_VAR]).toBe("atl_test");
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });

  test("forwards only for plugins the query actually loads", () => {
    const fixture = makePluginEnvFixture({ enabled: true });
    try {
      expect(
        buildClaudeCliEnv({
          executablePath: "/tmp/claude",
          cwd: fixture.cwd,
          enabledPlugins: { "remote@shop": false },
          resolver: shellResolver(fixture.configDir),
        })[PLUGIN_TOKEN_ENV_VAR],
      ).toBeUndefined();
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true });
    }

    const disabled = makePluginEnvFixture({ enabled: false });
    try {
      expect(
        buildClaudeCliEnv({
          executablePath: "/tmp/claude",
          cwd: disabled.cwd,
          resolver: shellResolver(disabled.configDir),
        })[PLUGIN_TOKEN_ENV_VAR],
      ).toBeUndefined();
      // Stave's plugin policy can load a plugin Claude's settings disable.
      expect(
        buildClaudeCliEnv({
          executablePath: "/tmp/claude",
          cwd: disabled.cwd,
          enabledPlugins: { "remote@shop": true },
          resolver: shellResolver(disabled.configDir),
        })[PLUGIN_TOKEN_ENV_VAR],
      ).toBe("atl_test");
    } finally {
      rmSync(disabled.directory, { recursive: true, force: true });
    }
  });

  test("MCP refresh picks up a token exported after the first probe", async () => {
    if (process.platform === "win32") return;
    const fixture = makePluginEnvFixture({ enabled: true });
    const profilePath = path.join(fixture.directory, "profile");
    const shellPath = path.join(fixture.directory, "login-shell");
    writeFileSync(profilePath, `export CLAUDE_CONFIG_DIR='${fixture.configDir}'\n`);
    writeFileSync(shellPath, `#!/bin/sh\n. '${profilePath}'\nexec /bin/sh -c "$2"\n`);
    chmodSync(shellPath, 0o755);
    const original = {
      SHELL: process.env.SHELL,
      HOME: process.env.HOME,
      ZDOTDIR: process.env.ZDOTDIR,
    };
    __resetExecutablePathCachesForTests();
    // The fallback system shells read the fixture's empty dotfiles, not the
    // developer's real profile.
    process.env.SHELL = shellPath;
    process.env.HOME = fixture.directory;
    process.env.ZDOTDIR = fixture.directory;
    try {
      const build = () =>
        buildClaudeCliEnv({ executablePath: "/tmp/claude", cwd: fixture.cwd });
      expect(build()[PLUGIN_TOKEN_ENV_VAR]).toBeUndefined();

      writeFileSync(
        profilePath,
        `export CLAUDE_CONFIG_DIR='${fixture.configDir}'\nexport ${PLUGIN_TOKEN_ENV_VAR}=atl_test\n`,
      );
      expect(build()[PLUGIN_TOKEN_ENV_VAR]).toBeUndefined();

      expect(
        await refreshMcpLoginShellEnv({
          provider: "claude",
          executablePath: "/tmp/claude",
          cwd: fixture.cwd,
        }),
      ).toEqual([PLUGIN_TOKEN_ENV_VAR]);
      expect(build()[PLUGIN_TOKEN_ENV_VAR]).toBe("atl_test");
    } finally {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      __resetExecutablePathCachesForTests();
      rmSync(fixture.directory, { recursive: true, force: true });
    }
  });
});
