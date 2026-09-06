import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import {
  canExecutePath,
  listNodeVersionManagerBinDirs,
  normalizeExecutablePathValue,
  prepareExecutableLookup,
  resolveExecutablePath,
  resolveLoginShellCommandPath,
  resolveLoginShellEnvVarValue,
  resolveLoginShellEnvVarValuesAsync,
  resolveLoginShellEnvVarValues,
} from "./executable-path";
import {
  buildRuntimeProcessEnv,
  compareSemverVersions,
  parseSemverVersion,
  probeExecutableVersion,
  runExecutableProbe,
} from "./runtime-shared";
import { isClaudeCliAutoModeSupportedVersion } from "./claude-cli-compat";
import { readPrimaryStaveLocalMcpManifestSync } from "../main/stave-local-mcp-manifest";
import { CODEX_STAVE_MCP_TOKEN_ENV_VAR } from "../main/codex-mcp";
import { buildProjectShellEnv } from "../shared/project-node-env";
import {
  getClaudeMcpConfigPaths,
  getCodexMcpConfigPathGroups,
} from "./mcp-config-refresh";
import { readMcpEnvVarNames, type McpEnvProvider } from "./mcp-env";

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

const EXECUTABLE_DISCOVERY_COMMANDS = [
  "claude",
  "codex",
  "agent",
  "cursor-agent",
  "kiro-cli",
] as const;

type PreparedExecutableSelection = {
  key: string;
  path: string;
};

type VersionedExecutableCandidate = {
  path: string;
  version: ReturnType<typeof parseSemverVersion>;
};

let preparedClaudeSelection: PreparedExecutableSelection | undefined;
let preparedCodexSelection: PreparedExecutableSelection | undefined;
let pendingCliExecutableDiscovery: Promise<void> | undefined;

function getCliExecutableDiscoveryKey() {
  return [
    process.env.HOME,
    process.env.PATH,
    process.env.SHELL,
    process.env.NVM_DIR,
    process.env.FNM_DIR,
    process.env.VOLTA_HOME,
    process.env.STAVE_CLAUDE_CLI_PATH,
    process.env.CLAUDE_CODE_PATH,
    process.env.STAVE_CLAUDE_CMD,
    process.env.STAVE_CODEX_CLI_PATH,
    process.env.STAVE_CODEX_CMD,
  ].join("\u0000");
}

function getPreparedExecutablePath(args: {
  selection: PreparedExecutableSelection | undefined;
  key: string;
}) {
  if (args.selection?.key !== args.key) {
    return null;
  }
  return canExecutePath({ path: args.selection.path })
    ? args.selection.path
    : null;
}

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

export function applyConfiguredMcpEnvOverrides(args: {
  env: Record<string, string | undefined>;
  provider: McpEnvProvider;
  configPaths: readonly string[];
  cwd?: string;
  resolver?: (args: { key: string }) => string | null;
}) {
  const envVarNames = readMcpEnvVarNames({
    provider: args.provider,
    paths: args.configPaths,
    cwd: args.cwd,
  });
  const missingNames = envVarNames.filter((key) => !args.env[key]?.trim());
  const resolvedValues = args.resolver
    ? null
    : resolveLoginShellEnvVarValues({
        keys: missingNames,
      });

  for (const key of envVarNames) {
    if (args.env[key]?.trim()) {
      continue;
    }
    const value = (args.resolver
      ? args.resolver({ key })
      : resolvedValues?.[key]
    )?.trim();
    if (value) {
      args.env[key] = value;
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

function uniqueExecutableCandidates(values: Array<string | undefined | null>) {
  return values
    .map((value) => normalizeExecutablePathValue({ value }) ?? value?.trim())
    .filter(
      (value, index, entries): value is string =>
        Boolean(value) && entries.indexOf(value) === index,
    );
}

function getClaudeExecutableCandidates() {
  const configuredPath = resolveConfiguredClaudeCliExecutablePath();
  if (configuredPath) {
    return { configuredPath, candidates: [configuredPath] };
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
  return {
    configuredPath: "",
    candidates: uniqueExecutableCandidates([
      process.env.STAVE_CLAUDE_CLI_PATH,
      process.env.CLAUDE_CODE_PATH,
      `${homedir()}/.claude/local/claude`,
      `${homedir()}/.bun/bin/claude`,
      `${homedir()}/.local/bin/claude`,
      ...versionManagerClaudePaths,
      loginShellClaudePath,
      baseResolved,
    ]),
  };
}

function getCodexExecutableCandidates() {
  const configuredPath = resolveConfiguredCodexCliExecutablePath();
  if (configuredPath) {
    return {
      configuredPath,
      candidates: [configuredPath],
      baseResolved: configuredPath,
    };
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
  return {
    configuredPath: "",
    baseResolved,
    candidates: uniqueExecutableCandidates([
      process.env.STAVE_CODEX_CLI_PATH,
      `${homedir()}/.bun/bin/codex`,
      `${homedir()}/.local/bin/codex`,
      ...versionManagerCodexPaths,
      loginShellCodexPath,
      baseResolved,
    ]),
  };
}

async function resolveClaudeExecutablePathAsync() {
  const { configuredPath, candidates } = getClaudeExecutableCandidates();
  if (configuredPath) return configuredPath;
  const available: VersionedExecutableCandidate[] = (
    await Promise.all(
      candidates
        .filter((candidate) => canExecutePath({ path: candidate }))
        .map(async (candidate) => {
          const result = await runExecutableProbe({
            executablePath: candidate,
            commandArgs: ["--version"],
            env: buildClaudeCliEnv({ executablePath: candidate }),
            timeoutMs: 2_000,
            maxBytes: 64 * 1024,
          });
          return result.status === 0
            ? {
                path: candidate,
                version: parseSemverVersion({ value: result.text }),
              }
            : null;
        }),
    )
  ).filter((entry): entry is VersionedExecutableCandidate => Boolean(entry));

  available.sort((left, right) => {
    if (left.version && right.version) {
      return compareSemverVersions(right.version, left.version);
    }
    if (left.version) return -1;
    if (right.version) return 1;
    return 0;
  });
  return available[0]?.path ?? "";
}

async function resolveCodexExecutablePathAsync() {
  const { configuredPath, candidates, baseResolved } =
    getCodexExecutableCandidates();
  if (configuredPath) return configuredPath;
  const available = await Promise.all(
    candidates
      .filter((candidate) => isExecutableFile({ path: candidate }))
      .map(async (candidate) => {
        const result = await runExecutableProbe({
          executablePath: candidate,
          commandArgs: ["--version"],
          env: buildCodexCliEnv({ executablePath: candidate }),
          timeoutMs: 2_000,
          maxBytes: 64 * 1024,
        });
        return result.status === 0
          ? {
              path: candidate,
              version: parseVersionFromStdout({ stdout: result.stdout }),
            }
          : null;
      }),
  );

  let selectedPath = baseResolved;
  let selectedVersion: readonly number[] | null = null;
  for (const entry of available) {
    if (!entry) continue;
    if (!entry.version) {
      if (!selectedPath) selectedPath = entry.path;
      continue;
    }
    if (
      !selectedVersion ||
      compareVersion(entry.version, selectedVersion) > 0
    ) {
      selectedPath = entry.path;
      selectedVersion = entry.version;
    }
  }
  return selectedPath;
}

async function prepareCliDiscoveryEnvironment() {
  const initialKeys = [
    ...CLAUDE_LOGIN_SHELL_ENV_PREFERRED_KEYS,
    ...CODEX_LOGIN_SHELL_ENV_PREFERRED_KEYS,
    ...CODEX_LOGIN_SHELL_ENV_FALLBACK_KEYS,
  ];
  const initialValues = await resolveLoginShellEnvVarValuesAsync({
    keys: initialKeys,
  });
  const cwd = process.cwd();
  const claudeConfigPaths = getClaudeMcpConfigPaths({
    cwd,
    claudeConfigDir: initialValues.CLAUDE_CONFIG_DIR ?? undefined,
  });
  const codexConfigPathGroups = getCodexMcpConfigPathGroups({
    cwd,
    codexHome: initialValues.CODEX_HOME ?? undefined,
  });
  const mcpEnvKeys = [
    ...readMcpEnvVarNames({
      provider: "claude",
      paths: claudeConfigPaths,
      cwd,
    }),
    ...readMcpEnvVarNames({
      provider: "codex",
      paths: [
        ...codexConfigPathGroups.globalPaths,
        ...codexConfigPathGroups.projectPaths,
      ],
    }),
  ];
  if (mcpEnvKeys.length > 0) {
    await resolveLoginShellEnvVarValuesAsync({ keys: mcpEnvKeys });
  }
}

/**
 * Prepare the synchronous provider resolvers for an availability/catalog read.
 * Shell initialization and version ranking run asynchronously here; callers
 * retain the established synchronous selection contract after the preparation.
 */
export function prepareCliExecutableDiscovery(): Promise<void> {
  if (pendingCliExecutableDiscovery) {
    return pendingCliExecutableDiscovery.then(() =>
      prepareCliExecutableDiscovery(),
    );
  }
  const key = getCliExecutableDiscoveryKey();
  if (
    preparedClaudeSelection?.key === key &&
    preparedCodexSelection?.key === key
  ) {
    return Promise.resolve();
  }
  const discovery = (async () => {
    await prepareExecutableLookup([
      ...EXECUTABLE_DISCOVERY_COMMANDS,
      process.env.STAVE_CLAUDE_CMD ?? "",
      process.env.STAVE_CODEX_CMD ?? "",
    ]);
    await prepareCliDiscoveryEnvironment();
    const [claudePath, codexPath] = await Promise.all([
      resolveClaudeExecutablePathAsync(),
      resolveCodexExecutablePathAsync(),
    ]);
    if (getCliExecutableDiscoveryKey() === key) {
      preparedClaudeSelection = { key, path: claudePath };
      preparedCodexSelection = { key, path: codexPath };
    }
  })();
  pendingCliExecutableDiscovery = discovery;
  return discovery.finally(() => {
    if (pendingCliExecutableDiscovery === discovery) {
      pendingCliExecutableDiscovery = undefined;
    }
  });
}

export function __resetCliExecutableDiscoveryForTests() {
  preparedClaudeSelection = undefined;
  preparedCodexSelection = undefined;
  pendingCliExecutableDiscovery = undefined;
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

  const preparedPath = getPreparedExecutablePath({
    selection: preparedClaudeSelection,
    key: getCliExecutableDiscoveryKey(),
  });
  if (preparedPath) return preparedPath;

  const { configuredPath: configuredResolved, candidates } =
    getClaudeExecutableCandidates();
  if (configuredResolved) {
    return configuredResolved;
  }

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
  cwd?: string;
  mcpConfigPaths?: readonly string[];
  resolver?: (args: { key: string }) => string | null;
}) {
  let env = buildRuntimeProcessEnv({
    executablePath: args.executablePath,
    extraPaths: CLAUDE_LOOKUP_PATHS,
    unsetEnvKeys: ["CLAUDECODE"],
  });

  applyLoginShellEnvOverrides({
    env,
    preferredKeys: CLAUDE_LOGIN_SHELL_ENV_PREFERRED_KEYS,
    resolver: args.resolver,
  });

  const mcpConfigPaths =
    args.mcpConfigPaths ??
    getClaudeMcpConfigPaths({
      cwd: args.cwd ?? process.cwd(),
      claudeConfigDir: env.CLAUDE_CONFIG_DIR,
    });
  applyConfiguredMcpEnvOverrides({
    env,
    provider: "claude",
    configPaths: mcpConfigPaths,
    cwd: args.cwd,
    resolver: args.resolver,
  });

  if (args.cwd) {
    env = buildProjectShellEnv({ cwd: args.cwd, baseEnv: env });
  }
  return env;
}

export function buildCodexCliEnv(
  args: {
    executablePath?: string;
    cwd?: string;
    mcpConfigPaths?: readonly string[];
    resolver?: (args: { key: string }) => string | null;
  } = {},
) {
  let env = buildRuntimeProcessEnv({
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
    resolver: args.resolver,
  });

  const mcpConfigPathGroups = getCodexMcpConfigPathGroups({
    cwd: args.cwd ?? process.cwd(),
    codexHome: env.CODEX_HOME,
  });
  applyConfiguredMcpEnvOverrides({
    env,
    provider: "codex",
    configPaths:
      args.mcpConfigPaths ?? [
        ...mcpConfigPathGroups.globalPaths,
        ...mcpConfigPathGroups.projectPaths,
      ],
    resolver: args.resolver,
  });
  if (args.cwd) {
    env = buildProjectShellEnv({ cwd: args.cwd, baseEnv: env });
  }
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

  const preparedPath = getPreparedExecutablePath({
    selection: preparedCodexSelection,
    key: getCliExecutableDiscoveryKey(),
  });
  if (preparedPath) return preparedPath;

  const {
    configuredPath: configuredResolved,
    candidates,
    baseResolved,
  } = getCodexExecutableCandidates();
  if (configuredResolved) {
    return configuredResolved;
  }

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
