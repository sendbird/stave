import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { disposeAllCodexAppServerClients, streamCodexWithAppServer } from "../electron/providers/codex-app-server-runtime";
import type { BridgeEvent, ProviderResponderResult } from "../electron/providers/types";

const directories: string[] = [];
const originalApprovalTimeout = process.env.STAVE_CODEX_APPROVAL_TIMEOUT_MS;
beforeEach(() => { process.env.STAVE_CODEX_APPROVAL_TIMEOUT_MS = "25"; });
afterEach(() => {
  if (originalApprovalTimeout === undefined) delete process.env.STAVE_CODEX_APPROVAL_TIMEOUT_MS;
  else process.env.STAVE_CODEX_APPROVAL_TIMEOUT_MS = originalApprovalTimeout;
  disposeAllCodexAppServerClients();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

// A real child process exercises JSON-RPC transport, pending approvals,
// responders and cancellation. It never calls a model or executes a tool.
function fakeServer(version: string) {
  const cwd = mkdtempSync(join(tmpdir(), "stave-reviewer-test-"));
  directories.push(cwd);
  const executable = join(cwd, "codex");
  const receipts = join(cwd, "receipts.jsonl");
  writeFileSync(executable, `#!${process.execPath}
import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
if (process.argv.includes("--version")) { console.log("codex-cli ${version}"); process.exit(0); }
const send = (message) => console.log(JSON.stringify({ jsonrpc: "2.0", ...message }));
createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line);
  if (m.id === "approval-1" && !m.method) {
    appendFileSync(${JSON.stringify(receipts)}, JSON.stringify({ decision: m.result.decision }) + "\\n");
    send({ method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } } });
    return;
  }
  if (!m.method || m.id == null) return;
  let result = {};
  if (m.method === "config/read") result = { config: {}, layers: [] };
  if (m.method === "account/read") result = { account: null, requiresOpenaiAuth: false };
  if (m.method === "thread/start" || m.method === "thread/resume") result = { thread: { id: "thread-1" } };
  if (m.method === "turn/start") {
    appendFileSync(${JSON.stringify(receipts)}, JSON.stringify({ approvalPolicy: m.params.approvalPolicy, approvalsReviewer: m.params.approvalsReviewer, sandboxPolicy: m.params.sandboxPolicy }) + "\\n");
    result = { turn: { id: "turn-1" } };
  }
  send({ id: m.id, result });
  if (m.method === "turn/start") setTimeout(() => send({ id: "approval-1", method: "item/commandExecution/requestApproval", params: { threadId: "thread-1", turnId: "turn-1", command: "test command", reason: "Human review required" } }), 10);
  if (m.method === "turn/interrupt") send({ method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1", status: "interrupted" } } });
});
`);
  chmodSync(executable, 0o755);
  return { cwd, executable, receipts };
}

for (const version of ["0.162.1", "0.162.0"]) {
  for (const decision of ["approve", "deny", "cancel"] as const) {
    test(`Run ${version} approval ${decision} keeps the pending request until the person responds`, async () => {
      const server = fakeServer(version);
      const events: BridgeEvent[] = [];
      let respond: ((args: { requestId: string; approved: boolean }) => ProviderResponderResult) | undefined;
      let abort: (() => void) | undefined;
      let approvalSeen!: () => void;
      const waiting = new Promise<void>((resolve) => { approvalSeen = resolve; });
      let settled = false;
      const work = streamCodexWithAppServer({
        providerId: "codex", cwd: server.cwd, taskId: `task-${version}-${decision}`, prompt: "Work",
        agentRunStage: { agentRunId: "run", stageId: "work", attempt: 1 },
        runtimeOptions: { codexBinaryPath: server.executable, codexApprovalPolicy: "on-request",
          codexApprovalsReviewer: "auto_review", codexFileAccess: "workspace-write", codexNetworkAccess: false },
        registerAbort: (fn) => { abort = fn; },
        registerApprovalResponder: (fn) => { respond = fn; },
        onEvent: (event) => { events.push(event); if (event.type === "approval") approvalSeen(); },
      }).finally(() => { settled = true; });
      await Promise.race([waiting, work.then(() => { throw new Error("Turn completed before approval"); })]);
      // Outlive the ordinary turn timeout: Runs must still wait for a person.
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(settled).toBe(false);
      expect(events.filter((event) => event.type === "approval")).toHaveLength(1);
      const sent = JSON.parse(readFileSync(server.receipts, "utf8").trim());
      expect(sent.approvalPolicy).toBe(version === "0.162.1" ? "on-request" : "never");
      expect(sent.approvalsReviewer).toBe(version === "0.162.1" ? "auto_review" : undefined);
      expect(sent.sandboxPolicy).toMatchObject({ type: "workspaceWrite", networkAccess: false, writableRoots: [server.cwd] });
      expect(events.some((event) => event.type === "system" && event.content.includes("auto-review is unavailable"))).toBe(version !== "0.162.1");
      expect(respond?.({ requestId: "wrong-request", approved: true }).ok).toBe(false);
      if (decision === "cancel") abort?.();
      else expect(respond?.({ requestId: "approval-1", approved: decision === "approve" }).ok).toBe(true);
      await work;
      expect(settled).toBe(true);
      expect(events.some((event) => event.type === "done")).toBe(true);
      expect(respond?.({ requestId: "approval-1", approved: true }).ok).toBe(false);
      const receipt = readFileSync(server.receipts, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      if (decision !== "cancel") expect(receipt[1].decision).toBe(decision === "approve" ? "accept" : "decline");
    }, 10_000);
  }
}
