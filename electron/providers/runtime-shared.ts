import { spawnSync } from "node:child_process";
import path from "node:path";
import { buildExecutableLookupEnv } from "./executable-path";

const DEFAULT_UNSET_ENV_KEYS = [
  "ELECTRON_RUN_AS_NODE",
  "ELECTRON_NO_ATTACH_CONSOLE",
  "ELECTRON_NO_ASAR",
  "ELECTRON_ENABLE_LOGGING",
  "ELECTRON_ENABLE_STACK_DUMPING",
  "ELECTRON_DISABLE_SECURITY_WARNINGS",
] as const;

export interface ParsedSemverVersion {
  major: number;
  minor: number;
  patch: number;
}

export function parseBooleanEnv(args: { value: string | undefined; fallback: boolean }) {
  const normalized = args.value?.trim().toLowerCase();
  if (!normalized) {
    return args.fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return args.fallback;
}

/**
 * Parse a positive integer environment variable. Returns the fallback when the
 * value is undefined, empty, non-numeric, or not strictly positive.
 */
export function parsePositiveIntEnv(args: {
  value: string | undefined;
  fallback: number;
}) {
  const normalized = args.value?.trim();
  if (!normalized) {
    return args.fallback;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return args.fallback;
  }
  return parsed;
}

export function parseSemverVersion(args: { value: string }) {
  const match = args.value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  } satisfies ParsedSemverVersion;
}

export function compareSemverVersions(left: ParsedSemverVersion, right: ParsedSemverVersion) {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
}

export function buildRuntimeProcessEnv(args: {
  executablePath?: string;
  extraPaths?: readonly string[];
  unsetEnvKeys?: readonly string[];
  baseEnv?: Record<string, string | undefined>;
}) {
  const env = {
    ...process.env,
    ...args.baseEnv,
  } as Record<string, string | undefined>;

  for (const key of [...DEFAULT_UNSET_ENV_KEYS, ...(args.unsetEnvKeys ?? [])]) {
    delete env[key];
  }

  env.PATH = buildExecutableLookupEnv({
    baseEnv: env,
    extraPaths: [
      ...(args.extraPaths ?? []),
      args.executablePath ? path.dirname(args.executablePath) : "",
    ],
  }).PATH;

  return env;
}

export function summarizePathHead(args: { value: string | undefined; maxEntries?: number }) {
  return (args.value ?? "")
    .split(":")
    .filter(Boolean)
    .slice(0, args.maxEntries ?? 8)
    .join(":");
}

export function probeExecutableVersion(args: {
  executablePath: string;
  env: Record<string, string | undefined>;
  versionArgs?: string[];
}) {
  const result = spawnSync(args.executablePath, args.versionArgs ?? ["--version"], {
    encoding: "utf8",
    env: args.env,
  });
  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();

  return {
    status: result.status,
    signal: result.signal,
    error: result.error ? String(result.error) : "",
    stdout,
    stderr,
    text: `${stdout}\n${stderr}`.trim(),
  };
}
