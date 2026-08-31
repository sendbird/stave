import { homedir } from "node:os";
import path from "node:path";
import {
  canExecutePath,
  normalizeExecutablePathValue,
  resolveExecutablePath,
  resolveLoginShellCommandPath,
} from "./executable-path";
import { buildRuntimeProcessEnv } from "./runtime-shared";

const KIRO_CLI_COMMAND = "kiro-cli";

function resolveConfiguredKiroExecutablePath() {
  return (
    resolveExecutablePath({
      absolutePathEnvVar: "STAVE_KIRO_CLI_PATH",
      commandEnvVar: "STAVE_KIRO_CLI_CMD",
      defaultCommand: "",
    }) ?? ""
  );
}

export function resolveKiroExecutablePath(
  args: { explicitPath?: string } = {},
) {
  const explicitPath = normalizeExecutablePathValue({
    value: args.explicitPath,
  });
  if (explicitPath && canExecutePath({ path: explicitPath })) {
    return explicitPath;
  }

  const configuredPath = resolveConfiguredKiroExecutablePath();
  if (configuredPath) {
    return configuredPath;
  }

  const loginShellPath = resolveLoginShellCommandPath({
    command: KIRO_CLI_COMMAND,
  });
  if (loginShellPath && canExecutePath({ path: loginShellPath })) {
    return loginShellPath;
  }

  const homeBinCandidate = path.join(
    homedir(),
    ".local",
    "bin",
    KIRO_CLI_COMMAND,
  );
  return canExecutePath({ path: homeBinCandidate }) ? homeBinCandidate : "";
}

export function buildKiroCliEnv(args: {
  executablePath: string;
  baseEnv?: Record<string, string | undefined>;
}) {
  return buildRuntimeProcessEnv({
    executablePath: args.executablePath,
    baseEnv: args.baseEnv,
    extraPaths: [path.join(homedir(), ".local", "bin")],
  });
}
