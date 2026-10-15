import { homedir } from "node:os";
import path from "node:path";
import {
  canExecutePath,
  normalizeExecutablePathValue,
  resolveExecutablePath,
  resolveLoginShellCommandPath,
} from "./executable-path";
import { buildRuntimeProcessEnv, probeExecutableVersion } from "./runtime-shared";
import { parseOpenCodeVersion } from "./opencode/opencode-version";

const OPENCODE_CLI_COMMAND = "opencode";

/**
 * Install locations that a login shell may not have on `PATH`: the official
 * install script writes to `~/.opencode/bin`, and user-local installs land in
 * `~/.local/bin`. Package-manager installs (npm, Homebrew) are found through
 * the login shell instead.
 */
function openCodeHomeBinDirectories() {
  return [
    path.join(homedir(), ".opencode", "bin"),
    path.join(homedir(), ".local", "bin"),
  ];
}

function resolveConfiguredOpenCodeExecutablePath() {
  return (
    resolveExecutablePath({
      absolutePathEnvVar: "STAVE_OPENCODE_CLI_PATH",
      commandEnvVar: "STAVE_OPENCODE_CLI_CMD",
      defaultCommand: "",
    }) ?? ""
  );
}

/**
 * Lookup order: the path set in Settings, then `STAVE_OPENCODE_CLI_PATH` /
 * `STAVE_OPENCODE_CLI_CMD`, then the login shell, then the install
 * locations above. Both the 1.x (`opencode-ai`) and 2.x (`@opencode/cli`)
 * packages install the same `opencode` binary name.
 */
export function resolveOpenCodeExecutablePath(
  args: { explicitPath?: string } = {},
) {
  const explicitPath = normalizeExecutablePathValue({
    value: args.explicitPath,
  });
  if (explicitPath && canExecutePath({ path: explicitPath })) {
    return explicitPath;
  }

  const configuredPath = resolveConfiguredOpenCodeExecutablePath();
  if (configuredPath) {
    return configuredPath;
  }

  const loginShellPath = resolveLoginShellCommandPath({
    command: OPENCODE_CLI_COMMAND,
  });
  if (loginShellPath && canExecutePath({ path: loginShellPath })) {
    return loginShellPath;
  }

  for (const directory of openCodeHomeBinDirectories()) {
    const candidate = path.join(directory, OPENCODE_CLI_COMMAND);
    if (canExecutePath({ path: candidate })) {
      return candidate;
    }
  }
  return "";
}

export function buildOpenCodeCliEnv(args: {
  executablePath: string;
  baseEnv?: Record<string, string | undefined>;
}) {
  return buildRuntimeProcessEnv({
    executablePath: args.executablePath,
    baseEnv: args.baseEnv,
    extraPaths: openCodeHomeBinDirectories(),
  });
}

/**
 * The installed release line (1 or 2), or null when it cannot be read. Used
 * where the two lines differ in CLI behavior rather than for the ACP version
 * gate, which reports a full reason instead. Bounded by the probe's 2-second
 * timeout.
 */
export function readOpenCodeMajorVersion(args: {
  executablePath: string;
  env: Record<string, string | undefined>;
}): number | null {
  const probe = probeExecutableVersion({
    executablePath: args.executablePath,
    env: args.env,
  });
  if (probe.status !== 0) {
    return null;
  }
  return parseOpenCodeVersion(probe.text)?.major ?? null;
}
