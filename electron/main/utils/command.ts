import { spawn } from "node:child_process";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import {
  hasSourceControlConflicts,
  parseSourceControlStatusLines,
} from "../../../src/lib/source-control-status";
import { buildExecutableLookupEnv } from "../../providers/executable-path";
import { buildRepositoryShellEnv } from "../../shared/repository-node-env";
import type { CommandResult, SourceControlStatusItem } from "../types";

const COMMAND_OUTPUT_LIMIT = 128_000;

export function resolveCommandCwd(args: { cwd?: string }) {
  if (args.cwd && path.isAbsolute(args.cwd)) {
    return args.cwd;
  }
  return process.cwd();
}

function resolveCommandOutputLimit(maxOutputChars?: number) {
  return typeof maxOutputChars === "number" &&
    Number.isSafeInteger(maxOutputChars) &&
    maxOutputChars > 0
    ? maxOutputChars
    : COMMAND_OUTPUT_LIMIT;
}

export function appendCommandOutput(
  current: string,
  chunk: string,
  maxOutputChars = COMMAND_OUTPUT_LIMIT,
) {
  const outputLimit = resolveCommandOutputLimit(maxOutputChars);
  const next = current + chunk;
  if (next.length <= outputLimit) {
    return next;
  }
  const truncated = next.slice(next.length - outputLimit);
  const firstCodeUnit = truncated.charCodeAt(0);
  return firstCodeUnit >= 0xdc00 && firstCodeUnit <= 0xdfff
    ? truncated.slice(1)
    : truncated;
}

/**
 * Decode child-process output without corrupting a multi-byte UTF-8 character
 * when Node splits its bytes across adjacent `data` chunks.
 */
export function createCommandOutputCollector(maxOutputChars?: number) {
  const decoder = new StringDecoder("utf8");
  const outputLimit = resolveCommandOutputLimit(maxOutputChars);
  let output = "";
  let finished = false;
  let truncated = false;

  function appendDecoded(decoded: string) {
    if (output.length + decoded.length > outputLimit) {
      truncated = true;
    }
    output = appendCommandOutput(output, decoded, outputLimit);
  }

  return {
    append(chunk: Buffer) {
      if (finished) {
        return;
      }
      appendDecoded(decoder.write(chunk));
    },
    finish() {
      if (!finished) {
        finished = true;
        appendDecoded(decoder.end());
      }
      return output;
    },
    wasTruncated() {
      return truncated;
    },
  };
}

/** How long a timed-out or cancelled command has to exit after SIGTERM before SIGKILL. */
export const COMMAND_KILL_GRACE_MS = 5_000;

/**
 * SIGTERM to the direct child; if it is still running once the grace ends,
 * SIGKILL. The caller's result does not wait for that, and a shell's
 * descendants are not signalled.
 */
function terminateCommand(child: ReturnType<typeof spawn>, graceMs = COMMAND_KILL_GRACE_MS) {
  child.kill("SIGTERM");
  const force = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, graceMs);
  force.unref?.();
  child.once("exit", () => clearTimeout(force));
}

export function runCommand(args: {
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxOutputChars?: number;
  timeoutMs?: number;
}): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve) => {
    const cwd = resolveCommandCwd({ cwd: args.cwd });
    const env = buildRepositoryShellEnv({
      cwd,
      baseEnv: buildExecutableLookupEnv({
        baseEnv: args.env,
      }),
    });
    const child = spawn(args.command, {
      shell: true,
      cwd,
      env,
    });

    const stdout = createCommandOutputCollector(args.maxOutputChars);
    const stderr = createCommandOutputCollector(args.maxOutputChars);
    let settled = false;
    const timeout =
      args.timeoutMs && args.timeoutMs > 0
        ? setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            terminateCommand(child);
            resolve({
              ok: false,
              code: -1,
              stdout: stdout.finish(),
              stderr: `${stderr.finish()}\nCommand timed out after ${args.timeoutMs}ms.`.trim(),
              stdoutTruncated: stdout.wasTruncated(),
              stderrTruncated: stderr.wasTruncated(),
            });
          }, args.timeoutMs)
        : null;
    timeout?.unref?.();
    const clearCommandTimeout = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.append(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.append(chunk);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearCommandTimeout();
      resolve({
        ok: false,
        code: -1,
        stdout: stdout.finish(),
        stderr: `${stderr.finish()}\n${String(error)}`.trim(),
        stdoutTruncated: stdout.wasTruncated(),
        stderrTruncated: stderr.wasTruncated(),
      });
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearCommandTimeout();
      resolve({
        ok: code === 0,
        code: code ?? -1,
        stdout: stdout.finish(),
        stderr: stderr.finish(),
        stdoutTruncated: stdout.wasTruncated(),
        stderrTruncated: stderr.wasTruncated(),
      });
    });
  });
}

/** The stderr of a command its caller cancelled. */
export const COMMAND_CANCELLED_MESSAGE = "Command was cancelled.";

export function runCommandArgs(args: {
  command: string;
  commandArgs?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxOutputChars?: number;
  timeoutMs?: number;
  /** Aborting kills the command (SIGTERM); an already aborted signal starts none. */
  signal?: AbortSignal;
  /** Overrides `COMMAND_KILL_GRACE_MS`. */
  killGraceMs?: number;
}): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve) => {
    if (args.signal?.aborted) {
      resolve({ ok: false, code: -1, stdout: "", stderr: COMMAND_CANCELLED_MESSAGE });
      return;
    }
    const cwd = resolveCommandCwd({ cwd: args.cwd });
    const env = buildRepositoryShellEnv({
      cwd,
      baseEnv: buildExecutableLookupEnv({
        baseEnv: args.env,
      }),
    });
    const child = spawn(args.command, args.commandArgs ?? [], {
      shell: false,
      cwd,
      env,
    });

    const stdout = createCommandOutputCollector(args.maxOutputChars);
    const stderr = createCommandOutputCollector(args.maxOutputChars);
    let settled = false;
    const terminate = () => terminateCommand(child, args.killGraceMs);
    const timeout =
      args.timeoutMs && args.timeoutMs > 0
        ? setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            clearCommandTimeout();
            terminate();
            resolve({
              ok: false,
              code: -1,
              stdout: stdout.finish(),
              stderr: `${stderr.finish()}\nCommand timed out after ${args.timeoutMs}ms.`.trim(),
              stdoutTruncated: stdout.wasTruncated(),
              stderrTruncated: stderr.wasTruncated(),
            });
          }, args.timeoutMs)
        : null;
    timeout?.unref?.();
    const onAbort = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearCommandTimeout();
      terminate();
      resolve({
        ok: false,
        code: -1,
        stdout: stdout.finish(),
        stderr: `${stderr.finish()}\n${COMMAND_CANCELLED_MESSAGE}`.trim(),
        stdoutTruncated: stdout.wasTruncated(),
        stderrTruncated: stderr.wasTruncated(),
      });
    };
    const clearCommandTimeout = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      args.signal?.removeEventListener("abort", onAbort);
    };
    args.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.append(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.append(chunk);
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearCommandTimeout();
      resolve({
        ok: false,
        code: -1,
        stdout: stdout.finish(),
        stderr: `${stderr.finish()}\n${String(error)}`.trim(),
        stdoutTruncated: stdout.wasTruncated(),
        stderrTruncated: stderr.wasTruncated(),
      });
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearCommandTimeout();
      resolve({
        ok: code === 0,
        code: code ?? -1,
        stdout: stdout.finish(),
        stderr: stderr.finish(),
        stdoutTruncated: stdout.wasTruncated(),
        stderrTruncated: stderr.wasTruncated(),
      });
    });
  });
}

export function parseStatusLines(args: {
  stdout: string;
}): SourceControlStatusItem[] {
  return parseSourceControlStatusLines({ stdout: args.stdout });
}

export function hasConflictItems(args: { items: SourceControlStatusItem[] }) {
  return args.items.some((item) => hasSourceControlConflicts({ item }));
}

export function quotePath(args: { value: string }) {
  return args.value.replaceAll('"', '\\"');
}
