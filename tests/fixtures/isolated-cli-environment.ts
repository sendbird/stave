import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { __resetExecutablePathCachesForTests } from "../../electron/providers/executable-path";

const ISOLATED_KEYS = ["SHELL", "HOME", "CLAUDE_CONFIG_DIR", "CODEX_HOME"] as const;

/**
 * Building a Claude or Codex CLI environment probes the login shell (PATH,
 * CLAUDE_CONFIG_DIR, CODEX_HOME, env references in MCP config) and reads
 * provider config under HOME. Against the developer's real shell and home each
 * probe can take a second or more, it varies by machine, and an unset value
 * falls through to the next shell, so a test that builds one can blow the
 * default timeout. This points every probe at a fixture shell that runs the
 * probe without sourcing startup files, and at a home and config dirs under
 * `root`, so each probe answers at once with a non-empty value.
 *
 * Restore with the returned function; it also clears the process-wide probe
 * caches so later tests in the same process probe their own environment.
 */
export function isolateCliEnvironment(root: string) {
  const shell = path.join(root, "login-shell");
  writeFileSync(shell, '#!/bin/sh\nexec /bin/sh -c "$2"\n', { mode: 0o755 });
  const env = {
    SHELL: shell,
    HOME: root,
    CLAUDE_CONFIG_DIR: path.join(root, "host-claude"),
    CODEX_HOME: path.join(root, "host-codex"),
  };
  mkdirSync(env.CLAUDE_CONFIG_DIR, { recursive: true });
  mkdirSync(env.CODEX_HOME, { recursive: true });
  const original = Object.fromEntries(ISOLATED_KEYS.map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  __resetExecutablePathCachesForTests();
  return {
    env,
    restore() {
      for (const key of ISOLATED_KEYS) {
        const value = original[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      __resetExecutablePathCachesForTests();
    },
  };
}
