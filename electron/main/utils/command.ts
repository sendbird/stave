import { spawn } from "node:child_process";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import {
  hasSourceControlConflicts,
  parseSourceControlStatusLines,
} from "../../../src/lib/source-control-status";
import { buildExecutableLookupEnv } from "../../providers/executable-path";
import { buildProjectShellEnv } from "../../shared/project-node-env";
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

export function runCommand(args: {
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxOutputChars?: number;
}): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve) => {
    const cwd = resolveCommandCwd({ cwd: args.cwd });
    const env = buildProjectShellEnv({
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

export function runCommandArgs(args: {
  command: string;
  commandArgs?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxOutputChars?: number;
}): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve) => {
    const cwd = resolveCommandCwd({ cwd: args.cwd });
    const env = buildProjectShellEnv({
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
