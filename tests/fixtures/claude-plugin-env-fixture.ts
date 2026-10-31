import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { __resetExecutablePathCachesForTests } from "../../electron/providers/executable-path";

export const PLUGIN_TOKEN_ENV_VAR = "STAVE_FIXTURE_PLUGIN_MCP_TOKEN";
export const PLUGIN_ID = "remote@shop";

/**
 * A Claude config dir with one user-scope plugin whose MCP header needs a
 * token, plus a workspace. `enabled` is the plugin's Claude settings decision.
 */
export function makeClaudePluginEnvFixture(args: { enabled: boolean }) {
  const directory = mkdtempSync(path.join(tmpdir(), "stave-plugin-env-"));
  const configDir = path.join(directory, "claude-home");
  const cwd = path.join(directory, "workspace");
  const installPath = path.join(configDir, "plugins", "cache", "shop", "remote", "1.0.0");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(installPath, { recursive: true });
  writeFileSync(
    path.join(configDir, "plugins", "installed_plugins.json"),
    JSON.stringify({ version: 2, plugins: { [PLUGIN_ID]: [{ scope: "user", installPath }] } }),
  );
  writeFileSync(
    path.join(configDir, "settings.json"),
    JSON.stringify({ enabledPlugins: { [PLUGIN_ID]: args.enabled } }),
  );
  const writeServer = (url: string) =>
    writeFileSync(
      path.join(installPath, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          remote: {
            type: "http",
            url,
            headers: { Authorization: `Bearer \${${PLUGIN_TOKEN_ENV_VAR}}` },
          },
        },
      }),
    );
  writeServer("https://remote.example.test/mcp");
  return {
    directory,
    configDir,
    cwd,
    installPath,
    writeServer,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

/**
 * Runs `run` with a login shell that sources a profile exporting
 * `CLAUDE_CONFIG_DIR` and the plugin token. HOME and ZDOTDIR point at the
 * fixture so the fallback system shells never read the developer's dotfiles.
 */
export async function withPluginTokenProfileShell<T>(
  fixture: { directory: string; configDir: string },
  run: () => T | Promise<T>,
) {
  const profilePath = path.join(fixture.directory, "profile");
  const shellPath = path.join(fixture.directory, "login-shell");
  writeFileSync(
    profilePath,
    `export CLAUDE_CONFIG_DIR='${fixture.configDir}'\nexport ${PLUGIN_TOKEN_ENV_VAR}=atl_test\n`,
  );
  writeFileSync(shellPath, `#!/bin/sh\n. '${profilePath}'\nexec /bin/sh -c "$2"\n`);
  chmodSync(shellPath, 0o755);
  const keys = ["SHELL", "HOME", "ZDOTDIR", "CLAUDE_CONFIG_DIR", PLUGIN_TOKEN_ENV_VAR] as const;
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  __resetExecutablePathCachesForTests();
  Object.assign(process.env, {
    SHELL: shellPath,
    HOME: fixture.directory,
    ZDOTDIR: fixture.directory,
  });
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env[PLUGIN_TOKEN_ENV_VAR];
  try {
    return await run();
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
    __resetExecutablePathCachesForTests();
  }
}
