import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { app } from "electron";
import { Utf8LineBuffer } from "../../shared/utf8-line-buffer";

export interface EslintDiagnostic {
  ruleId: string | null;
  severity: number; // 1 = warning, 2 = error
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface EslintResult {
  ok: boolean;
  diagnostics?: EslintDiagnostic[];
  output?: string; // fixed source text (only when fix=true and changes were made)
  detail?: string;
}

const ESLINT_WORKER_STDIN_BUFFER_MAX_BYTES = 2 * 1024 * 1024;
const ESLINT_WORKER_STDIN_LINE_MAX_BYTES = 1 * 1024 * 1024;
const ESLINT_WORKER_STDOUT_BUFFER_MAX_BYTES = 2 * 1024 * 1024;
const ESLINT_WORKER_STDOUT_LINE_MAX_BYTES = 1 * 1024 * 1024;

// ---------- Worker script (inlined to survive bundling + asar) ----------

const WORKER_CODE = `
"use strict";
const path = require("path");
const lintInstances = new Map();
const fixInstances = new Map();
const MAX_STDIN_BUFFER_BYTES = ${ESLINT_WORKER_STDIN_BUFFER_MAX_BYTES};
const MAX_STDIN_LINE_BYTES = ${ESLINT_WORKER_STDIN_LINE_MAX_BYTES};

function byteLengthUtf8(value) {
  return Buffer.byteLength(value, "utf8");
}

function getEslint(rootPath, fix) {
  const cache = fix ? fixInstances : lintInstances;
  let instance = cache.get(rootPath);
  if (instance) return instance;
  const eslintPackage = require(path.join(rootPath, "node_modules", "eslint", "package.json"));
  const { ESLint } = require(path.join(rootPath, "node_modules", "eslint"));
  const eslintMajorVersion = Number.parseInt(String(eslintPackage.version || "0").split(".")[0], 10);
  const options = { cwd: rootPath, fix };
  if (Number.isFinite(eslintMajorVersion) && eslintMajorVersion < 10) {
    options.resolvePluginsRelativeTo = rootPath;
  }
  instance = new ESLint(options);
  cache.set(rootPath, instance);
  return instance;
}

async function handleRequest(req) {
  try {
    const eslint = getEslint(req.rootPath, req.type === "fix");
    const results = await eslint.lintText(req.text, {
      filePath: path.join(req.rootPath, req.filePath),
    });
    const first = results[0];
    if (!first) return { id: req.id, ok: true, diagnostics: [] };
    return {
      id: req.id,
      ok: true,
      diagnostics: first.messages.map(function(m) {
        return { ruleId: m.ruleId, severity: m.severity, message: m.message,
                 line: m.line, column: m.column, endLine: m.endLine, endColumn: m.endColumn };
      }),
      output: first.output,
    };
  } catch (err) {
    return { id: req.id, ok: false, detail: err && err.message || String(err) };
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", function(chunk) {
  buffer += chunk;
  if (byteLengthUtf8(buffer) > MAX_STDIN_BUFFER_BYTES) {
    process.stderr.write("[stave-eslint-worker] stdin buffer overflow\\n");
    process.exit(1);
    return;
  }
  let i;
  while ((i = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, i);
    buffer = buffer.slice(i + 1);
    if (byteLengthUtf8(line) > MAX_STDIN_LINE_BYTES) {
      process.stderr.write("[stave-eslint-worker] stdin line overflow\\n");
      process.exit(1);
      return;
    }
    if (!line.trim()) continue;
    try {
      const req = JSON.parse(line);
      handleRequest(req).then(function(res) {
        process.stdout.write(JSON.stringify(res) + "\\n");
      });
    } catch (e) {}
  }
});
process.stdout.write(JSON.stringify({ ready: true }) + "\\n");
`;

let workerScriptPath: string | null = null;

function getWorkerScriptPath(): string {
  if (workerScriptPath) return workerScriptPath;
  const tmpDir = app.getPath("temp");
  workerScriptPath = path.join(tmpDir, "stave-eslint-worker.cjs");
  // Always refresh the worker script so app updates do not keep running stale code from temp.
  writeFileSync(workerScriptPath, WORKER_CODE, "utf8");
  return workerScriptPath;
}

// ---------- Worker management ----------

interface PendingRequest {
  resolve: (result: EslintResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface WorkerState {
  child: ChildProcess;
  pending: Map<number, PendingRequest>;
  nextId: number;
  lineBuffer: Utf8LineBuffer;
  exitDetail: string | null;
}

const workers = new Map<string, WorkerState>();

function getOrSpawnWorker(rootPath: string): WorkerState {
  const existing = workers.get(rootPath);
  if (existing && existing.child.exitCode === null) {
    return existing;
  }

  if (existing) {
    for (const req of existing.pending.values()) {
      clearTimeout(req.timer);
      req.resolve({ ok: false, detail: "Worker exited" });
    }
    existing.pending.clear();
    workers.delete(rootPath);
  }

  const child = spawn(process.execPath, [getWorkerScriptPath()], {
    cwd: rootPath,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NODE_ENV: undefined },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const state: WorkerState = {
    child,
    pending: new Map(),
    nextId: 1,
    lineBuffer: new Utf8LineBuffer({
      label: "eslint-worker stdout",
      maxBufferBytes: ESLINT_WORKER_STDOUT_BUFFER_MAX_BYTES,
      maxLineBytes: ESLINT_WORKER_STDOUT_LINE_MAX_BYTES,
    }),
    exitDetail: null,
  };

  child.stdout!.setEncoding("utf8");
  child.stdout!.on("data", (chunk: string) => {
    let lines: string[];
    try {
      lines = state.lineBuffer.append(chunk);
    } catch (error) {
      state.exitDetail = error instanceof Error ? error.message : String(error);
      for (const req of state.pending.values()) {
        clearTimeout(req.timer);
        req.resolve({ ok: false, detail: state.exitDetail });
      }
      state.pending.clear();
      child.kill();
      return;
    }
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.ready) continue;
        const req = state.pending.get(msg.id);
        if (req) {
          clearTimeout(req.timer);
          state.pending.delete(msg.id);
          req.resolve({
            ok: msg.ok,
            diagnostics: msg.diagnostics,
            output: msg.output,
            detail: msg.detail,
          });
        }
      } catch {
        // ignore
      }
    }
  });

  child.on("exit", () => {
    const detail = state.exitDetail ?? "Worker exited unexpectedly";
    for (const req of state.pending.values()) {
      clearTimeout(req.timer);
      req.resolve({ ok: false, detail });
    }
    state.pending.clear();
    workers.delete(rootPath);
  });

  workers.set(rootPath, state);
  return state;
}

function sendRequest(rootPath: string, type: "lint" | "fix", filePath: string, text: string): Promise<EslintResult> {
  return new Promise((resolve) => {
    const worker = getOrSpawnWorker(rootPath);
    const id = worker.nextId++;
    const timer = setTimeout(() => {
      worker.pending.delete(id);
      resolve({ ok: false, detail: "ESLint timed out" });
    }, 15_000);

    worker.pending.set(id, { resolve, timer });
    worker.child.stdin!.write(JSON.stringify({ id, type, rootPath, filePath, text }) + "\n");
  });
}

// ---------- Entry check cache ----------

const eslintExistsCache = new Map<string, { exists: boolean; timestamp: number }>();
const CACHE_TTL = 30_000;

async function hasEslint(rootPath: string): Promise<boolean> {
  const cached = eslintExistsCache.get(rootPath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.exists;
  }
  let exists = false;
  try {
    await fs.access(path.join(rootPath, "node_modules", "eslint", "package.json"));
    exists = true;
  } catch {
    // not found
  }
  eslintExistsCache.set(rootPath, { exists, timestamp: Date.now() });
  return exists;
}

// ---------- Public API ----------

export async function lintFile(args: {
  rootPath: string;
  filePath: string;
  text: string;
}): Promise<EslintResult> {
  if (!(await hasEslint(args.rootPath))) {
    return { ok: false, detail: "ESLint not found in project" };
  }
  return sendRequest(args.rootPath, "lint", args.filePath, args.text);
}

export async function fixFile(args: {
  rootPath: string;
  filePath: string;
  text: string;
}): Promise<EslintResult> {
  if (!(await hasEslint(args.rootPath))) {
    return { ok: false, detail: "ESLint not found in project" };
  }
  return sendRequest(args.rootPath, "fix", args.filePath, args.text);
}

export function stopWorkers() {
  for (const [, state] of workers) {
    state.child.kill();
  }
  workers.clear();
}

app.on("will-quit", stopWorkers);
