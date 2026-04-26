import { spawnSync } from "node:child_process";
import { accessSync, constants, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

interface ResolveExecutablePathArgs {
  absolutePathEnvVar: string;
  commandEnvVar: string;
  defaultCommand: string;
  absolutePathEnvVars?: string[];
  commandEnvVars?: string[];
  explicitPaths?: string[];
  extraPaths?: string[];
}

const LOGIN_SHELL_PATH_MARKER = "__STAVE_LOGIN_SHELL_PATH__";
const LOGIN_SHELL_ENV_MARKER_PREFIX = "__STAVE_LOGIN_SHELL_ENV__";
const LOGIN_SHELL_COMMAND_MARKER_PREFIX = "__STAVE_LOGIN_SHELL_CMD__";
const LOGIN_SHELL_PROBE_TIMEOUT_MS = 2500;
let cachedLoginShellPath: string | null | undefined;
const cachedLoginShellEnvVarValues = new Map<string, string | null>();
const cachedLoginShellCommandPaths = new Map<string, string | null>();
let cachedNodeVersionManagerBinDirs: string[] | null = null;

function sanitizeCommandName(args: { value: string }) {
  const trimmed = args.value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function splitPathEntries(value: string | undefined) {
  return (value ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mergePathEntries(values: Array<string | undefined>) {
  const unique = new Set<string>();
  for (const value of values) {
    for (const entry of splitPathEntries(value)) {
      unique.add(entry);
    }
  }
  return [...unique].join(path.delimiter);
}

function getLookupCommand() {
  return process.platform === "win32" ? "where" : "which";
}

function getConfiguredHomeDirectory() {
  return process.env.HOME?.trim() || homedir();
}

function looksLikePathValue(value: string) {
  return (
    value.startsWith(".") ||
    value.startsWith("~") ||
    value.includes("/") ||
    value.includes("\\")
  );
}

function stripMatchingQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function extractExecutableCandidateFromShellLine(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const aliasMatch = trimmed.match(/^[^:\n]+:\s+aliased to\s+(.+)$/i);
  if (aliasMatch?.[1]) {
    return stripMatchingQuotes(aliasMatch[1]);
  }

  const aliasDeclarationMatch = trimmed.match(/^alias\s+[^=\s]+=(.+)$/i);
  if (aliasDeclarationMatch?.[1]) {
    return stripMatchingQuotes(aliasDeclarationMatch[1]);
  }

  const typeAliasMatch = trimmed.match(/^[^\s]+\s+is an alias for\s+(.+)$/i);
  if (typeAliasMatch?.[1]) {
    return stripMatchingQuotes(typeAliasMatch[1]);
  }

  const pathMatch = trimmed.match(
    /^[^\s]+\s+is\s+((?:~|\/|\.{1,2}[\\/]|[A-Za-z]:[\\/]).+)$/,
  );
  if (pathMatch?.[1]) {
    return stripMatchingQuotes(pathMatch[1]);
  }

  if (looksLikePathValue(trimmed)) {
    return stripMatchingQuotes(trimmed);
  }

  return null;
}

export function canExecutePath(args: { path: string }) {
  const normalizedPath =
    normalizeExecutablePathValue({ value: args.path }) ?? args.path.trim();
  if (!normalizedPath) {
    return false;
  }
  try {
    accessSync(
      normalizedPath,
      process.platform === "win32" ? constants.F_OK : constants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
}

function parseMarkedValue(args: { value: string; marker: string }) {
  const start = args.value.indexOf(args.marker);
  if (start < 0) {
    return null;
  }
  const valueStart = start + args.marker.length;
  const end = args.value.indexOf(args.marker, valueStart);
  if (end < 0) {
    return null;
  }
  const extracted = args.value.slice(valueStart, end).trim();
  return extracted.length > 0 ? extracted : null;
}

export function parseMarkedProbeOutput(args: {
  stdout: string | null | undefined;
  stderr?: string | null | undefined;
  marker: string;
}) {
  return parseMarkedValue({
    value: args.stdout ?? "",
    marker: args.marker,
  });
}

function sanitizeEnvVarName(args: { value: string }) {
  const trimmed = args.value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^[A-Z0-9_]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function getLoginShellCandidates() {
  return [
    process.env.SHELL?.trim(),
    process.platform === "darwin" ? "/bin/zsh" : "",
    "/bin/bash",
    "/bin/sh",
  ]
    .filter(Boolean)
    .filter((candidate, index, entries) => entries.indexOf(candidate) === index)
    .filter((candidate) => canExecutePath({ path: candidate }));
}

function resolveLoginShellPath(args: { baseEnv?: NodeJS.ProcessEnv } = {}) {
  const useCache = !args.baseEnv || args.baseEnv === process.env;
  if (useCache && cachedLoginShellPath !== undefined) {
    return cachedLoginShellPath;
  }
  if (process.platform === "win32") {
    if (useCache) {
      cachedLoginShellPath = null;
      return cachedLoginShellPath;
    }
    return null;
  }

  for (const shell of getLoginShellCandidates()) {
    const result = spawnSync(
      shell,
      [
        "-ilc",
        `printf '${LOGIN_SHELL_PATH_MARKER}%s${LOGIN_SHELL_PATH_MARKER}' "$PATH"`,
      ],
      {
        encoding: "utf8",
        env: {
          ...(args.baseEnv ?? process.env),
          TERM: args.baseEnv?.TERM || process.env.TERM || "dumb",
        },
        timeout: LOGIN_SHELL_PROBE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
    );
    const parsed = parseMarkedProbeOutput({
      stdout: result.stdout,
      stderr: result.stderr,
      marker: LOGIN_SHELL_PATH_MARKER,
    });
    if (parsed) {
      if (useCache) {
        cachedLoginShellPath = parsed;
        return cachedLoginShellPath;
      }
      return parsed;
    }
  }

  if (useCache) {
    cachedLoginShellPath = null;
    return cachedLoginShellPath;
  }
  return null;
}

export function resolveLoginShellEnvVarValue(args: { key: string }) {
  const safeKey = sanitizeEnvVarName({ value: args.key });
  if (!safeKey) {
    return null;
  }
  if (cachedLoginShellEnvVarValues.has(safeKey)) {
    return cachedLoginShellEnvVarValues.get(safeKey) ?? null;
  }
  if (process.platform === "win32") {
    cachedLoginShellEnvVarValues.set(safeKey, null);
    return null;
  }

  const marker = `${LOGIN_SHELL_ENV_MARKER_PREFIX}${safeKey}__`;
  for (const shell of getLoginShellCandidates()) {
    const result = spawnSync(
      shell,
      ["-ilc", `printf '${marker}%s${marker}' "\${${safeKey}:-}"`],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          TERM: process.env.TERM || "dumb",
        },
        timeout: LOGIN_SHELL_PROBE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
    );
    const parsed = parseMarkedProbeOutput({
      stdout: result.stdout,
      stderr: result.stderr,
      marker,
    });
    if (parsed) {
      cachedLoginShellEnvVarValues.set(safeKey, parsed);
      return parsed;
    }
  }

  cachedLoginShellEnvVarValues.set(safeKey, null);
  return null;
}

function safeReadDir(args: { path: string }) {
  try {
    return readdirSync(args.path);
  } catch {
    return [];
  }
}

function isExistingDirectory(args: { path: string }) {
  try {
    return statSync(args.path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Enumerate bin directories for Node.js version managers (nvm, fnm, volta).
 * These contain real node-based CLIs (claude, codex) installed globally under
 * a specific Node version. GUI-launched Electron apps on macOS typically do
 * not inherit these paths, so we scan them directly.
 */
export function listNodeVersionManagerBinDirs(
  args: { baseEnv?: NodeJS.ProcessEnv } = {},
) {
  if (process.platform === "win32") {
    return [];
  }
  const useCache = !args.baseEnv || args.baseEnv === process.env;
  if (useCache && cachedNodeVersionManagerBinDirs !== null) {
    return cachedNodeVersionManagerBinDirs;
  }

  const env = args.baseEnv ?? process.env;
  const home = env.HOME?.trim() || homedir();
  const dirs: string[] = [];

  // nvm: $NVM_DIR/versions/node/<version>/bin
  const nvmRoot = env.NVM_DIR?.trim() || `${home}/.nvm`;
  const nvmNodeRoot = path.join(nvmRoot, "versions", "node");
  for (const version of safeReadDir({ path: nvmNodeRoot })) {
    const binDir = path.join(nvmNodeRoot, version, "bin");
    if (isExistingDirectory({ path: binDir })) {
      dirs.push(binDir);
    }
  }

  // fnm: $FNM_DIR/node-versions/<version>/installation/bin
  const fnmRootCandidates = [
    env.FNM_DIR?.trim(),
    `${home}/.fnm`,
    `${home}/.local/share/fnm`,
  ].filter((value): value is string => Boolean(value));
  for (const fnmRoot of fnmRootCandidates) {
    const fnmNodeRoot = path.join(fnmRoot, "node-versions");
    for (const version of safeReadDir({ path: fnmNodeRoot })) {
      const binDir = path.join(fnmNodeRoot, version, "installation", "bin");
      if (isExistingDirectory({ path: binDir })) {
        dirs.push(binDir);
      }
    }
  }

  // volta shim directory (shims wrap real node binaries)
  const voltaBin = env.VOLTA_HOME?.trim()
    ? path.join(env.VOLTA_HOME.trim(), "bin")
    : `${home}/.volta/bin`;
  if (isExistingDirectory({ path: voltaBin })) {
    dirs.push(voltaBin);
  }

  const unique = [...new Set(dirs)];
  if (useCache) {
    cachedNodeVersionManagerBinDirs = unique;
  }
  return unique;
}

/**
 * Ask the user's login shell where a command lives via `command -v <name>`.
 * This leverages the user's full shell initialization (nvm, fnm, asdf, mise,
 * volta, chruby, custom PATH tweaks in .zshrc/.bashrc) so we can find a CLI
 * regardless of install method. Cached per-command.
 */
export function resolveLoginShellCommandPath(args: { command: string }) {
  const safeCommand = sanitizeCommandName({ value: args.command });
  if (!safeCommand) {
    return null;
  }
  if (cachedLoginShellCommandPaths.has(safeCommand)) {
    return cachedLoginShellCommandPaths.get(safeCommand) ?? null;
  }
  if (process.platform === "win32") {
    cachedLoginShellCommandPaths.set(safeCommand, null);
    return null;
  }

  const markerSuffix = safeCommand.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const marker = `${LOGIN_SHELL_COMMAND_MARKER_PREFIX}${markerSuffix}__`;
  for (const shell of getLoginShellCandidates()) {
    const result = spawnSync(
      shell,
      [
        "-ilc",
        `printf '${marker}%s${marker}' "$(command -v ${safeCommand} 2>/dev/null || true)"`,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          TERM: process.env.TERM || "dumb",
        },
        timeout: LOGIN_SHELL_PROBE_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
    );
    const parsed = parseMarkedProbeOutput({
      stdout: result.stdout,
      stderr: result.stderr,
      marker,
    });
    if (!parsed) {
      continue;
    }
    const normalized = normalizeExecutablePathValue({ value: parsed });
    if (normalized && canExecutePath({ path: normalized })) {
      cachedLoginShellCommandPaths.set(safeCommand, normalized);
      return normalized;
    }
  }

  cachedLoginShellCommandPaths.set(safeCommand, null);
  return null;
}

/** Reset module-level caches. Intended for tests only. */
export function __resetExecutablePathCachesForTests() {
  cachedLoginShellPath = undefined;
  cachedLoginShellEnvVarValues.clear();
  cachedLoginShellCommandPaths.clear();
  cachedNodeVersionManagerBinDirs = null;
}

export function resolveExecutableLookupPath(
  args: {
    basePath?: string;
    extraPaths?: string[];
    baseEnv?: NodeJS.ProcessEnv;
    loginShellPath?: string | null;
  } = {},
) {
  const home =
    args.baseEnv?.HOME?.trim() || process.env.HOME?.trim() || homedir();
  const loginShellPath =
    args.loginShellPath === undefined
      ? resolveLoginShellPath()
      : args.loginShellPath;
  const commonUnixPaths =
    process.platform === "win32"
      ? []
      : [
          `${home}/.bun/bin`,
          `${home}/.local/bin`,
          "/opt/homebrew/bin",
          "/opt/homebrew/sbin",
          "/usr/local/bin",
          "/usr/local/sbin",
          "/usr/bin",
          "/bin",
          "/usr/sbin",
          "/sbin",
        ];
  const versionManagerBinDirs = listNodeVersionManagerBinDirs({
    baseEnv: args.baseEnv,
  });

  return mergePathEntries([
    ...(args.extraPaths ?? []),
    args.basePath,
    loginShellPath ?? "",
    args.baseEnv?.PATH,
    process.env.PATH,
    ...commonUnixPaths,
    ...versionManagerBinDirs,
  ]);
}

export function buildExecutableLookupEnv(
  args: {
    baseEnv?: NodeJS.ProcessEnv;
    extraPaths?: string[];
    loginShellPath?: string | null;
  } = {},
) {
  const env = { ...(args.baseEnv ?? process.env) };
  const nextPath = resolveExecutableLookupPath({
    basePath: env.PATH,
    extraPaths: args.extraPaths,
    baseEnv: env,
    loginShellPath: args.loginShellPath,
  });
  if (nextPath) {
    env.PATH = nextPath;
  }
  return env;
}

export function normalizeExecutablePathValue(args: {
  value: string | undefined | null;
}) {
  const lines = (args.value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }

  let candidate: string | null = null;
  for (const line of lines) {
    candidate = extractExecutableCandidateFromShellLine(line);
    if (candidate) {
      break;
    }
  }

  if (!candidate && lines.length === 1) {
    const singleLine = stripMatchingQuotes(lines[0]);
    candidate = sanitizeCommandName({ value: singleLine });
  }
  if (!candidate) {
    return null;
  }

  const homeDirectory = getConfiguredHomeDirectory();
  let normalized = candidate;
  if (candidate === "~") {
    normalized = homeDirectory;
  } else if (candidate.startsWith("~/") || candidate.startsWith("~\\")) {
    normalized = path.join(homeDirectory, candidate.slice(2));
  }

  if (path.isAbsolute(normalized)) {
    return path.normalize(toAsarUnpackedPath(normalized));
  }

  return normalized;
}

function resolveFromCommand(args: { command: string; env: NodeJS.ProcessEnv }) {
  const normalizedCommand =
    normalizeExecutablePathValue({ value: args.command }) ?? args.command;
  const safeCommand = sanitizeCommandName({ value: normalizedCommand });
  if (!safeCommand) {
    return null;
  }

  const result = spawnSync(getLookupCommand(), [safeCommand], {
    encoding: "utf8",
    env: args.env,
  });

  if (result.status !== 0) {
    return null;
  }

  const resolved = normalizeExecutablePathValue({ value: result.stdout });
  if (!resolved) {
    return null;
  }
  if (!canExecutePath({ path: resolved })) {
    return null;
  }
  return resolved;
}

export function resolveExecutablePath(args: ResolveExecutablePathArgs) {
  const env = buildExecutableLookupEnv({
    extraPaths: args.extraPaths,
  });

  const explicitPaths = [
    ...(args.explicitPaths ?? []),
    process.env[args.absolutePathEnvVar]?.trim() ?? "",
    ...(args.absolutePathEnvVars ?? []).map(
      (envVar) => process.env[envVar]?.trim() ?? "",
    ),
  ].map(
    (candidate) => normalizeExecutablePathValue({ value: candidate }) ?? "",
  );
  for (const candidate of explicitPaths) {
    if (candidate && canExecutePath({ path: candidate })) {
      return candidate;
    }
  }

  const commandCandidates = [
    process.env[args.commandEnvVar]?.trim() ?? "",
    ...(args.commandEnvVars ?? []).map(
      (envVar) => process.env[envVar]?.trim() ?? "",
    ),
  ];
  for (const commandFromEnv of commandCandidates) {
    if (!commandFromEnv) {
      continue;
    }
    const normalizedCommand = normalizeExecutablePathValue({
      value: commandFromEnv,
    });
    if (!normalizedCommand) {
      continue;
    }
    if (looksLikePathValue(commandFromEnv)) {
      if (canExecutePath({ path: normalizedCommand })) {
        return normalizedCommand;
      }
      continue;
    }
    const fromConfiguredCommand = resolveFromCommand({
      command: normalizedCommand,
      env,
    });
    if (fromConfiguredCommand) {
      return fromConfiguredCommand;
    }
  }

  return resolveFromCommand({ command: args.defaultCommand, env });
}

export function toAsarUnpackedPath(value: string) {
  return value
    .replace(
      `${path.sep}app.asar${path.sep}`,
      `${path.sep}app.asar.unpacked${path.sep}`,
    )
    .replace("/app.asar/", "/app.asar.unpacked/")
    .replace("\\app.asar\\", "\\app.asar.unpacked\\");
}
