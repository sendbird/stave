import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
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
    timeout: 2_000,
    killSignal: "SIGKILL",
    maxBuffer: 64 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
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

export interface ExecutableProbeResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  error: string;
  stdout: string;
  stderr: string;
  text: string;
  timedOut: boolean;
}

/**
 * Run a small CLI capability probe without blocking the provider host loop.
 * Output is capped because availability and catalog probes must never become
 * an unbounded logging or memory surface.
 */
export function runExecutableProbe(args: {
  executablePath: string;
  commandArgs: readonly string[];
  env: Record<string, string | undefined>;
  cwd?: string;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<ExecutableProbeResult> {
  const timeoutMs = args.timeoutMs ?? 5_000;
  const maxBytes = args.maxBytes ?? 256 * 1024;

  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");

    const finish = (result: {
      status: number | null;
      signal: NodeJS.Signals | null;
      error?: string;
    }) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      if (killTimer) clearTimeout(killTimer);
      const normalizedStdout = stdout.trim();
      const normalizedStderr = stderr.trim();
      resolve({
        status: result.status,
        signal: result.signal,
        error: result.error ?? "",
        stdout: normalizedStdout,
        stderr: normalizedStderr,
        text: `${normalizedStdout}\n${normalizedStderr}`.trim(),
        timedOut,
      });
    };

    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(args.executablePath, [...args.commandArgs], {
        cwd: args.cwd,
        env: args.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      finish({
        status: null,
        signal: null,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const appendOutput = (target: "stdout" | "stderr", chunk: Buffer) => {
      if (settled || outputBytes >= maxBytes) {
        return;
      }
      const remaining = maxBytes - outputBytes;
      const bounded = chunk.subarray(0, remaining);
      outputBytes += bounded.byteLength;
      if (target === "stdout") {
        stdout += stdoutDecoder.write(bounded);
      } else {
        stderr += stderrDecoder.write(bounded);
      }
    };
    child.stdout.on("data", (chunk: Buffer) => appendOutput("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => appendOutput("stderr", chunk));
    child.once("error", (error) => {
      finish({ status: null, signal: null, error: error.message });
    });
    child.once("close", (status, signal) => finish({ status, signal }));

    timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        child.kill("SIGKILL");
        // A descendant can inherit a pipe and prevent `close` indefinitely.
        // The deadline must settle even when that descriptor stays open.
        child.stdout.destroy();
        child.stderr.destroy();
        finish({ status: null, signal: "SIGKILL", error: "Executable probe timed out." });
      }, 750);
      killTimer.unref?.();
    }, timeoutMs);
    timer.unref?.();
  });
}
