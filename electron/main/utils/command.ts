import { spawn } from "node:child_process";
import path from "node:path";
import {
  hasSourceControlConflicts,
  parseSourceControlStatusLines,
} from "../../../src/lib/source-control-status";
import { buildExecutableLookupEnv } from "../../providers/executable-path";
import type { CommandResult, SourceControlStatusItem } from "../types";

const COMMAND_OUTPUT_LIMIT = 128_000;

export function resolveCommandCwd(args: { cwd?: string }) {
  if (args.cwd && path.isAbsolute(args.cwd)) {
    return args.cwd;
  }
  return process.cwd();
}

export function appendCommandOutput(current: string, chunk: string) {
  const next = current + chunk;
  if (next.length <= COMMAND_OUTPUT_LIMIT) {
    return next;
  }
  return next.slice(next.length - COMMAND_OUTPUT_LIMIT);
}

export function runCommand(args: {
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve) => {
    const env = buildExecutableLookupEnv({
      baseEnv: args.env,
    });
    const child = spawn(args.command, {
      shell: true,
      cwd: resolveCommandCwd({ cwd: args.cwd }),
      env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout = appendCommandOutput(stdout, chunk.toString());
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendCommandOutput(stderr, chunk.toString());
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        code: -1,
        stdout,
        stderr: `${stderr}\n${String(error)}`.trim(),
      });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}

export function runCommandArgs(args: {
  command: string;
  commandArgs?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve) => {
    const env = buildExecutableLookupEnv({
      baseEnv: args.env,
    });
    const child = spawn(args.command, args.commandArgs ?? [], {
      shell: false,
      cwd: resolveCommandCwd({ cwd: args.cwd }),
      env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout = appendCommandOutput(stdout, chunk.toString());
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendCommandOutput(stderr, chunk.toString());
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        code: -1,
        stdout,
        stderr: `${stderr}\n${String(error)}`.trim(),
      });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}

export function parseStatusLines(args: { stdout: string }): SourceControlStatusItem[] {
  return parseSourceControlStatusLines({ stdout: args.stdout });
}

export function hasConflictItems(args: { items: SourceControlStatusItem[] }) {
  return args.items.some((item) => hasSourceControlConflicts({ item }));
}

export function quotePath(args: { value: string }) {
  return args.value.replaceAll('"', '\\"');
}
