import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave } from "./harness/stave-app";

test("built app quarantines an interrupted Codex start that never acknowledges", async () => {
  test.setTimeout(90_000);
  const testDir = await mkdtemp(path.join(tmpdir(), "stave-codex-start-recovery-"));
  const binaryPath = path.join(testDir, "codex-fixture");
  const requestLogPath = path.join(testDir, "requests.ndjson");
  const script = `#!/usr/bin/env node
const fs = require("node:fs");
const readline = require("node:readline");
let threadCount = 0;
let turnCount = 0;
const logPath = ${JSON.stringify(requestLogPath)};
const send = (value) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...value }) + "\\n");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialized") return;
  fs.appendFileSync(logPath, JSON.stringify({ method: message.method, threadId: message.params?.threadId ?? null }) + "\\n");
  if (message.id == null) return;
  const respond = (result) => send({ id: message.id, result });
  if (message.method === "initialize") return respond({ capabilities: {} });
  if (message.method === "account/read") return respond({ account: { type: "chatgpt" }, requiresOpenaiAuth: true });
  if (message.method === "thread/start") return respond({ thread: { id: "fixture-thread-" + ++threadCount } });
  if (message.method === "thread/resume") return respond({ thread: { id: message.params.threadId } });
  if (message.method === "turn/start") {
    if (++turnCount === 1) return; // Native request never acknowledges or completes.
    const turnId = "fixture-recovered-turn";
    respond({ turn: { id: turnId } });
    setTimeout(() => send({ method: "turn/completed", params: {
      threadId: message.params.threadId,
      turn: { id: turnId, status: "completed" },
    } }), 20);
    return;
  }
  respond({});
});
`;
  await writeFile(binaryPath, script);
  await chmod(binaryPath, 0o755);
  const stave = await launchStave();
  try {
    const first = await stave.page.evaluate(async ({ cwd, binaryPath }) => {
      const turnId = "injected-hung-start";
      const started = await window.api.provider!.startPushTurn!({
        providerId: "codex", turnId, cwd, prompt: "Fixture first turn",
        runtimeOptions: { codexBinaryPath: binaryPath, providerTimeoutMs: 45_000 },
      });
      if (!started.ok) throw new Error("Injected provider stream did not start");
      let cursor = 0;
      let sessionId: string | null = null;
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && !sessionId) {
        const batch = await window.api.provider!.readStreamTurn!({ streamId: started.streamId, cursor });
        cursor = batch.cursor;
        const session = batch.events.find((event) => event.type === "provider_session") as
          | { nativeSessionId: string } | undefined;
        sessionId = session?.nativeSessionId ?? null;
        if (!sessionId) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      if (!sessionId) throw new Error("Injected provider did not open a native thread");
      const abort = await window.api.provider!.abortTurn!({ turnId });
      let stopReason: string | null = null;
      const finishBy = Date.now() + 20_000;
      while (Date.now() < finishBy) {
        const batch = await window.api.provider!.readStreamTurn!({ streamId: started.streamId, cursor });
        cursor = batch.cursor;
        for (const event of batch.events) {
          if (event.type === "done") stopReason = event.stop_reason ?? null;
        }
        if (batch.done) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return { sessionId, abortOk: abort.ok, stopReason };
    }, { cwd: testDir, binaryPath });
    expect(first).toMatchObject({ abortOk: true, stopReason: "user_abort" });

    const recovery = await stave.page.evaluate(async ({ cwd, binaryPath, sessionId }) => {
      const options = { codexBinaryPath: binaryPath, providerTimeoutMs: 45_000 };
      const rejectedRaw = await window.api.provider!.streamTurn!({
        providerId: "codex", turnId: "injected-unsafe-resume", cwd,
        prompt: "Unsafe explicit resume", runtimeOptions: { ...options, codexResumeThreadId: sessionId },
      });
      const rejected = Array.isArray(rejectedRaw) ? rejectedRaw : [];
      const freshRaw = await window.api.provider!.streamTurn!({
        providerId: "codex", turnId: "injected-fresh-recovery", cwd,
        prompt: "Fresh session after quarantine", runtimeOptions: options,
      });
      const fresh = Array.isArray(freshRaw) ? freshRaw : [];
      const freshSession = fresh.find((event) => event.type === "provider_session") as
        | { nativeSessionId: string } | undefined;
      return {
        rejectedError: rejected.filter((event) => event.type === "error")
          .map((event) => (event as { message: string }).message),
        rejectedDone: rejected.some((event) => event.type === "done"),
        freshSessionId: freshSession?.nativeSessionId ?? null,
        freshDone: fresh.some((event) => event.type === "done"),
        freshErrors: fresh.filter((event) => event.type === "error")
          .map((event) => (event as { message: string }).message),
      };
    }, { cwd: testDir, binaryPath, sessionId: first.sessionId });
    const requestLog = (await readFile(requestLogPath, "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line) as { method: string; threadId: string | null });
    const result = {
      first,
      recovery,
      threadStarts: requestLog.filter((request) => request.method === "thread/start").length,
      threadResumes: requestLog.filter((request) => request.method === "thread/resume").length,
      turnStarts: requestLog.filter((request) => request.method === "turn/start").length,
    };
    console.log(`injected Codex interrupted-start recovery: ${JSON.stringify(result)}`);
    expect(recovery.rejectedError.some((message) => message.includes("Previous Codex turn is still stopping"))).toBe(true);
    expect(recovery.rejectedDone).toBe(true);
    expect(recovery.freshSessionId).toBeTruthy();
    expect(recovery.freshSessionId).not.toBe(first.sessionId);
    expect(recovery.freshDone).toBe(true);
    expect(recovery.freshErrors).toEqual([]);
    expect(result).toMatchObject({ threadStarts: 2, threadResumes: 0, turnStarts: 2 });
  } finally {
    await stave.close();
    await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
