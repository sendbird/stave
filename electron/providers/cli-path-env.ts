import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import {
  canExecutePath,
  listNodeVersionManagerBinDirs,
  normalizeExecutablePathValue,
  resolveExecutablePath,
  resolveLoginShellCommandPath,
  resolveLoginShellEnvVarValue,
} from "./executable-path";
import {
  buildRuntimeProcessEnv,
  compareSemverVersions,
  parseSemverVersion,
  probeExecutableVersion,
} from "./runtime-shared";
import { isClaudeCliAutoModeSupportedVersion } from "./claude-cli-compat";
import { readPrimaryStaveLocalMcpManifestSync } from "../main/stave-local-mcp-manifest";
import { CODEX_STAVE_MCP_TOKEN_ENV_VAR } from "../main/codex-mcp";

const CLAUDE_LOOKUP_PATHS = [
  `${homedir()}/.claude/local`,
  `${homedir()}/.bun/bin`,
  `${homedir()}/.local/bin`,
] as const;

const CODEX_LOOKUP_PATHS = [
  `${homedir()}/.bun/bin`,
  `${homedir()}/.local/bin`,
] as const;

const CODEX_LOGIN_SHELL_ENV_FALLBACK_KEYS = [
  "SLACK_OAUTH_TOKEN",
  "STAVE_LOCAL_MCP_TOKEN",
] as const;

const CLAUDE_LOGIN_SHELL_ENV_PREFERRED_KEYS = ["CLAUDE_CONFIG_DIR"] as const;

const CODEX_LOGIN_SHELL_ENV_PREFERRED_KEYS = ["CODEX_HOME"] as const;

function resolveConfiguredClaudeCliExecutablePath() {
  return (
    resolveExecutablePath({
      absolutePathEnvVar: "STAVE_CLAUDE_CLI_PATH",
      absolutePathEnvVars: ["CLAUDE_CODE_PATH"],
      commandEnvVar: "STAVE_CLAUDE_CMD",
      defaultCommand: "",
      extraPaths: [...CLAUDE_LOOKUP_PATHS],
    }) ?? ""
  );
}

function resolveConfiguredCodexCliExecutablePath() {
  return (
    resolveExecutablePath({
      absolutePathEnvVar: "STAVE_CODEX_CLI_PATH",
      commandEnvVar: "STAVE_CODEX_CMD",
      defaultCommand: "",
      extraPaths: [...CODEX_LOOKUP_PATHS],
    }) ?? ""
  );
}

export function applyLoginShellEnvOverrides(args: {
  env: Record<string, string | undefined>;
  preferredKeys?: readonly string[];
  fallbackKeys?: readonly string[];
  resolver?: (args: { key: string }) => string | null;
}) {
  const resolveValue =
    args.resolver ??
    ((input: { key: string }) => resolveLoginShellEnvVarValue(input));

  for (const key of args.preferredKeys ?? []) {
    const preferredValue = resolveValue({ key })?.trim();
    if (preferredValue) {
      args.env[key] = preferredValue;
    }
  }

  for (const key of args.fallbackKeys ?? []) {
    if (args.env[key]?.trim()) {
      continue;
    }
    const fallbackValue = resolveValue({ key })?.trim();
    if (fallbackValue) {
      args.env[key] = fallbackValue;
    }
  }
}

function probeClaudeExecutable(args: { path: string }) {
  const result = probeExecutableVersion({
    executablePath: args.path,
    env: buildClaudeCliEnv({ executablePath: args.path }),
  });
  if (result.status !== 0) {
    return null;
  }
  return {
    path: args.path,
    version: parseSemverVersion({ value: result.text }),
  };
}

export function resolveClaudeCliAutoModeSupport(args: {
  executablePath: string;
}) {
  const version =
    probeClaudeExecutable({ path: args.executablePath })?.version ?? null;
  return isClaudeCliAutoModeSupportedVersion({ version });
}

function parseVersionFromStdout(args: { stdout: string }) {
  const parsed = parseSemverVersion({ value: args.stdout });
  if (!parsed) {
    return null;
  }
  return [parsed.major, parsed.minor, parsed.patch] as const;
}

function compareVersion(a: readonly number[], b: readonly number[]) {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (left !== right) {
      return left - right;
    }
  }
  return 0;
}

function isExecutableFile(args: { path: string }) {
  try {
    accessSync(args.path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveClaudeCliExecutablePath(
  args: {
    explicitPath?: string;
  } = {},
) {
  const explicitPath = normalizeExecutablePathValue({
    value: args.explicitPath,
  });
  if (explicitPath) {
    return explicitPath;
  }

  const configuredResolved = resolveConfiguredClaudeCliExecutablePath();
  if (configuredResolved) {
    return configuredResolved;
  }

  const baseResolved =
    resolveExecutablePath({
      absolutePathEnvVar: "STAVE_CLAUDE_CLI_PATH",
      absolutePathEnvVars: ["CLAUDE_CODE_PATH"],
      commandEnvVar: "STAVE_CLAUDE_CMD",
      defaultCommand: "claude",
      extraPaths: [...CLAUDE_LOOKUP_PATHS],
    }) ?? "";

  const versionManagerClaudePaths = listNodeVersionManagerBinDirs().map(
    (binDir) => `${binDir}/claude`,
  );
  const loginShellClaudePath = resolveLoginShellCommandPath({
    command: "claude",
  });
  const candidates = [
    process.env.STAVE_CLAUDE_CLI_PATH,
    process.env.CLAUDE_CODE_PATH,
    `${homedir()}/.claude/local/claude`,
    `${homedir()}/.bun/bin/claude`,
    `${homedir()}/.local/bin/claude`,
    ...versionManagerClaudePaths,
    loginShellClaudePath ?? "",
    baseResolved,
  ]
    .map((value) => normalizeExecutablePathValue({ value }) ?? value?.trim())
    .filter(
      (value, index, entries): value is string =>
        Boolean(value) && entries.indexOf(value) === index,
    );

  const available = candidates
    .filter((candidate) => canExecutePath({ path: candidate }))
    .map((candidate) => probeClaudeExecutable({ path: candidate }))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (available.length === 0) {
    return "";
  }

  available.sort((left, right) => {
    if (left.version && right.version) {
      return compareSemverVersions(right.version, left.version);
    }
    if (left.version) {
      return -1;
    }
    if (right.version) {
      return 1;
    }
    return 0;
  });

  return available[0]?.path ?? "";
}

export function buildClaudeCliEnv(args: {
  executablePath: string;
  resolver?: (args: { key: string }) => string | null;
}) {
  const env = buildRuntimeProcessEnv({
    executablePath: args.executablePath,
    extraPaths: CLAUDE_LOOKUP_PATHS,
    unsetEnvKeys: ["CLAUDECODE"],
  });

  applyLoginShellEnvOverrides({
    env,
    preferredKeys: CLAUDE_LOGIN_SHELL_ENV_PREFERRED_KEYS,
    resolver: args.resolver,
  });

  return env;
}

export function buildCodexCliEnv(args: { executablePath?: string } = {}) {
  const env = buildRuntimeProcessEnv({
    executablePath: args.executablePath,
    extraPaths: CODEX_LOOKUP_PATHS,
  });
  const localMcpManifest = readPrimaryStaveLocalMcpManifestSync();
  if (localMcpManifest?.token?.trim()) {
    env[CODEX_STAVE_MCP_TOKEN_ENV_VAR] = localMcpManifest.token;
  }
  applyLoginShellEnvOverrides({
    env,
    preferredKeys: CODEX_LOGIN_SHELL_ENV_PREFERRED_KEYS,
    fallbackKeys: CODEX_LOGIN_SHELL_ENV_FALLBACK_KEYS,
  });
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function resolveCodexCliExecutablePath(
  args: { explicitPath?: string } = {},
) {
  const explicitPath = normalizeExecutablePathValue({
    value: args.explicitPath,
  });
  if (explicitPath) {
    return explicitPath;
  }

  const configuredResolved = resolveConfiguredCodexCliExecutablePath();
  if (configuredResolved) {
    return configuredResolved;
  }

  const baseResolved =
    resolveExecutablePath({
      absolutePathEnvVar: "STAVE_CODEX_CLI_PATH",
      commandEnvVar: "STAVE_CODEX_CMD",
      defaultCommand: "codex",
      extraPaths: [...CODEX_LOOKUP_PATHS],
    }) ?? "";

  const versionManagerCodexPaths = listNodeVersionManagerBinDirs().map(
    (binDir) => `${binDir}/codex`,
  );
  const loginShellCodexPath = resolveLoginShellCommandPath({
    command: "codex",
  });
  const candidates = [
    normalizeExecutablePathValue({
      value: process.env.STAVE_CODEX_CLI_PATH,
    }) ??
      process.env.STAVE_CODEX_CLI_PATH?.trim() ??
      "",
    `${homedir()}/.bun/bin/codex`,
    `${homedir()}/.local/bin/codex`,
    ...versionManagerCodexPaths,
    loginShellCodexPath ?? "",
    baseResolved,
  ]
    .map((value) => normalizeExecutablePathValue({ value }) ?? value?.trim())
    .filter(
      (value, index, entries): value is string =>
        Boolean(value) && entries.indexOf(value) === index,
    );

  let selectedPath = baseResolved;
  let selectedVersion: readonly number[] | null = null;

  for (const candidate of candidates) {
    if (!isExecutableFile({ path: candidate })) {
      continue;
    }
    const versionProbe = probeExecutableVersion({
      executablePath: candidate,
      env: buildCodexCliEnv({ executablePath: candidate }),
    });
    if (versionProbe.status !== 0) {
      continue;
    }
    const parsed = parseVersionFromStdout({ stdout: versionProbe.stdout });
    if (!parsed) {
      if (!selectedPath) {
        selectedPath = candidate;
      }
      continue;
    }
    if (!selectedVersion || compareVersion(parsed, selectedVersion) > 0) {
      selectedPath = candidate;
      selectedVersion = parsed;
    }
  }

  return selectedPath;
}
