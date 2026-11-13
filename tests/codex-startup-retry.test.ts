import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disposeAllCodexAppServerClients, getCodexAppServerClientFromRuntimeOptions, streamCodexWithAppServer } from "../electron/providers/codex-app-server-runtime";
import { CodexAppServerRpcError, toCodexUserFacingErrorMessage } from "../electron/providers/codex-app-server-errors";
import { CODEX_INITIALIZE_TIMEOUT_MS, initializeCodexAppServer, retryCodexStartup } from "../electron/providers/codex-startup-retry";
import { applyRuntimeLocale } from "../src/i18n/runtime";

const directories: string[] = [];
afterEach(() => {
  disposeAllCodexAppServerClients();
  applyRuntimeLocale("en");
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

// A child runtime speaks the real transport; no model or tool is called.
function fakeRuntime(method: string, failures: number, message = "workspace routing discovery failed", exitOnFailure = false) {
  const cwd = mkdtempSync(join(tmpdir(), "stave-startup-test-"));
  directories.push(cwd);
  const executable = join(cwd, "codex");
  const log = join(cwd, "requests.jsonl");
  writeFileSync(log, "");
  writeFileSync(executable, `#!${process.execPath}
import { createInterface } from "node:readline";
import { appendFileSync, readFileSync } from "node:fs";
if (process.argv.includes("--version")) { console.log("codex-cli 0.167.0"); process.exit(0); }
const log = ${JSON.stringify(log)};
const send = (m) => console.log(JSON.stringify({ jsonrpc: "2.0", ...m }));
createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line);
  if (m.id == null || !m.method) return;
  appendFileSync(log, JSON.stringify({ method: m.method, params: m.params, pid: process.pid }) + "\\n");
  const count = readFileSync(log, "utf8").trim().split("\\n").map(JSON.parse).filter(r => r.method === m.method).length;
  if (m.method === ${JSON.stringify(method)} && count <= ${failures}) {
    if (${exitOnFailure}) { process.stderr.write(${JSON.stringify(message)}); process.exit(1); }
    return send({ id: m.id, error: { code: -32603, message: ${JSON.stringify(message)} } });
  }
  let result = {};
  if (m.method === "config/read") result = { config: {}, layers: [] };
  if (m.method === "account/read") result = { account: null, requiresOpenaiAuth: false };
  if (m.method === "thread/start" || m.method === "thread/resume") result = { thread: { id: "thread-1" } };
  if (m.method === "turn/start") result = { turn: { id: "turn-1" } };
  send({ id: m.id, result });
  if (m.method === "turn/start") setTimeout(() => send({ method: "turn/completed", params: {
    threadId: "thread-1", turn: { id: "turn-1", status: "completed" }
  } }), 5);
});
`);
  chmodSync(executable, 0o755);
  const calls = () => readFileSync(log, "utf8").trim().split("\n").filter(Boolean)
    .map(line => JSON.parse(line) as { method: string; params: Record<string, unknown>; pid: number });
  const run = (secondaryReadOnly = false) => streamCodexWithAppServer({
    providerId: "codex", turnId: "stave-turn", prompt: "Hello", cwd,
    ...(secondaryReadOnly ? { executionPolicy: "secondary-read-only" as const } : {}),
    runtimeOptions: { codexBinaryPath: executable, codexApprovalPolicy: "never",
      ...(method === "thread/resume" ? { codexResumeThreadId: "thread-1" } : {}) },
  });
  return { calls, run, cwd, executable };
}

for (const method of ["initialize", "account/read", "thread/start", "thread/resume"]) {
  test(`${method} recovers from routing discovery failure before executing once`, async () => {
    const runtime = fakeRuntime(method, 1);
    const events = await runtime.run(method === "thread/start");
    expect(events.filter(e => e.type === "error")).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: "done" });
    expect(runtime.calls().filter(c => c.method === method)).toHaveLength(2);
    expect(runtime.calls().filter(c => c.method === "turn/start")).toHaveLength(1);
    const starts = runtime.calls().filter(c => c.method === "thread/start");
    expect(starts.every(c => c.params.cwd === runtime.cwd)).toBe(true);
    if (method === "initialize") expect(new Set(runtime.calls().filter(c => c.method === method).map(c => c.pid)).size).toBe(2);
    if (method === "thread/start") expect(starts.every(c => c.params.ephemeral === true && c.params.sandbox === "read-only")).toBe(true);
  }, 15_000); // Includes cold CLI/environment probes and the real retry delay.
}

test("persistent discovery timeout stops after three attempts with a short localized error", async () => {
  applyRuntimeLocale("ko");
  const runtime = fakeRuntime("account/read", 99, "workspace routing discovery timed out");
  const events = await runtime.run();
  expect(runtime.calls().filter(c => c.method === "account/read")).toHaveLength(3);
  expect(runtime.calls().filter(c => c.method === "turn/start")).toHaveLength(0);
  expect(events).toEqual([
    { type: "error", message: "Codex를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.", recoverable: false },
    { type: "done", stop_reason: "runtime_failure" },
  ]);
});

test("authentication failures are not retried", async () => {
  const runtime = fakeRuntime("account/read", 99, "workspace routing discovery unauthorized (401)");
  await runtime.run();
  expect(runtime.calls().filter(c => c.method === "account/read")).toHaveLength(1);
});

test("turn/start failures are never replayed", async () => {
  const runtime = fakeRuntime("turn/start", 1);
  const events = await runtime.run();
  expect(runtime.calls().filter(c => c.method === "turn/start")).toHaveLength(1);
  expect(events.at(-1)).toEqual({ type: "done", stop_reason: "runtime_failure" });
});

test("persistent initialization failures retire each child and stop at three attempts", async () => {
  const runtime = fakeRuntime("initialize", 99);
  const events = await runtime.run();
  expect(runtime.calls().filter(c => c.method === "initialize")).toHaveLength(3);
  expect(new Set(runtime.calls().map(c => c.pid)).size).toBe(3);
  expect(events).toEqual([
    { type: "error", message: "Codex could not start. Try again shortly.", recoverable: false },
    { type: "done", stop_reason: "runtime_failure" },
  ]);
});

test("concurrent callers share initialization and its retry", async () => {
  const runtime = fakeRuntime("initialize", 1);
  const client = getCodexAppServerClientFromRuntimeOptions({ runtimeOptions: { codexBinaryPath: runtime.executable } });
  await Promise.all([client.ensureStarted(), client.ensureStarted(), client.ensureStarted()]);
  expect(runtime.calls().filter(c => c.method === "initialize")).toHaveLength(2);
});

test("discovery errors on stderr survive an early process exit and retry", async () => {
  const runtime = fakeRuntime("initialize", 1, "workspace routing discovery failed", true);
  const events = await runtime.run();
  expect(runtime.calls().filter(c => c.method === "initialize")).toHaveLength(2);
  expect(events.filter(e => e.type === "error")).toEqual([]);
  expect(runtime.calls().filter(c => c.method === "turn/start")).toHaveLength(1);
});

test("initialization deadline and backoff are bounded; ambiguous thread timeouts are not replayed", async () => {
  await initializeCodexAppServer(async (method, _params, options) => {
    expect(method).toBe("initialize");
    expect(options.timeoutMs).toBe(CODEX_INITIALIZE_TIMEOUT_MS);
    return {};
  });
  const waits: number[] = [];
  let attempts = 0;
  await expect(retryCodexStartup(async () => {
    attempts++;
    throw new Error(`Codex App Server initialize timed out after ${CODEX_INITIALIZE_TIMEOUT_MS}ms.`);
  }, { initialize: true, wait: async ms => { waits.push(ms); } })).rejects.toThrow("initialize timed out");
  expect(attempts).toBe(3);
  expect(waits).toEqual([500, 1500]);
  attempts = 0;
  await expect(retryCodexStartup(async () => {
    attempts++;
    throw new Error("Codex App Server thread/start timed out after 30000ms.");
  })).rejects.toThrow("thread/start timed out");
  expect(attempts).toBe(1);
});

test("canceling during backoff cannot start another attempt", async () => {
  const controller = new AbortController();
  let attempts = 0;
  await expect(retryCodexStartup(async () => {
    attempts++;
    throw new CodexAppServerRpcError("workspace routing discovery failed");
  }, { signal: controller.signal, wait: async () => { controller.abort(); } })).rejects.toThrow();
  expect(attempts).toBe(1);
});

test("startup deadlines use the short error in both languages", () => {
  for (const [locale, expected] of [["en", "Codex could not start. Try again shortly."],
    ["ko", "Codex를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요."]]) {
    applyRuntimeLocale(locale);
    for (const method of ["initialize", "account/read", "thread/start", "thread/resume"]) {
      expect(toCodexUserFacingErrorMessage({ message: `Codex App Server ${method} timed out after 30000ms.` })).toBe(expected);
    }
  }
});
