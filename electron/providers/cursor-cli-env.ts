import { homedir } from "node:os";
import path from "node:path";
import {
  canExecutePath,
  normalizeExecutablePathValue,
  resolveExecutablePath,
  resolveLoginShellCommandPath,
} from "./executable-path";
import { buildRuntimeProcessEnv } from "./runtime-shared";

const CURSOR_AGENT_COMMANDS = ["agent", "cursor-agent"] as const;

function resolveConfiguredCursorAgentExecutablePath() {
  return (
    resolveExecutablePath({
      absolutePathEnvVar: "STAVE_CURSOR_AGENT_PATH",
      commandEnvVar: "STAVE_CURSOR_AGENT_CMD",
      defaultCommand: "",
    }) ?? ""
  );
}

export function resolveCursorAgentExecutablePath(
  args: { explicitPath?: string } = {},
) {
  const explicitPath = normalizeExecutablePathValue({
    value: args.explicitPath,
  });
  if (explicitPath && canExecutePath({ path: explicitPath })) {
    return explicitPath;
  }

  const configuredPath = resolveConfiguredCursorAgentExecutablePath();
  if (configuredPath) {
    return configuredPath;
  }

  for (const command of CURSOR_AGENT_COMMANDS) {
    const loginShellPath = resolveLoginShellCommandPath({ command });
    if (loginShellPath && canExecutePath({ path: loginShellPath })) {
      return loginShellPath;
    }
  }

  for (const command of CURSOR_AGENT_COMMANDS) {
    const candidate = path.join(homedir(), ".local", "bin", command);
    if (canExecutePath({ path: candidate })) {
      return candidate;
    }
  }

  return "";
}

export function buildCursorAgentEnv(args: {
  executablePath: string;
  baseEnv?: Record<string, string | undefined>;
}) {
  return buildRuntimeProcessEnv({
    executablePath: args.executablePath,
    baseEnv: args.baseEnv,
    extraPaths: [path.join(homedir(), ".local", "bin")],
  });
}
