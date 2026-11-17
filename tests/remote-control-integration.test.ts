import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { RemoteControlStore } from "../electron/persistence/remote-control-store";
import { createRemoteMobileAssets, REMOTE_MOBILE_COPY_KEYS, REMOTE_MOBILE_JS } from "../electron/main/remote-control/mobile-page";
import type { RemoteRendererTarget } from "../electron/main/remote-control/renderer-bridge";
import { createRemoteControlRuntime, type RemoteControlRuntime } from "../electron/main/remote-control/runtime";
import type { RemoteControlApi } from "../src/lib/remote-control";
import type { ApprovalPart, ChatMessage, UserInputPart } from "../src/types/chat";

/**
 * Real HTTP, real SQLite store, real renderer bridge and the real renderer
 * responder running the store's respond actions. Only two boundaries are
 * stand-ins: the Electron IPC hop between main and the window (a structured
 * clone through a fake `webContents`) and the provider runtime the store's
 * respond actions call (`window.api.provider.respond*`).
 */

const WORKSPACE = "ws-remote";
const TASK = "task-remote";
const TURN = "turn-remote";
const originalWindow = globalThis.window;

const pendingApproval: ApprovalPart = {
  type: "approval",
  requestId: "approval-1",
  toolName: "Bash",
  description: "Run the type check",
  input: "bun run typecheck",
  state: "approval-requested",
};
const pendingQuestion: UserInputPart = {
  type: "user_input",
  requestId: "question-1",
  toolName: "AskUserQuestion",
  questions: [
    { question: "Which branch?", header: "Branch", options: [{ label: "Main", description: "", value: "main" }, { label: "Release", description: "" }] },
  ],
  state: "input-requested",
};

function message(id: string, parts: ChatMessage["parts"]): ChatMessage {
  return { id, role: "assistant", model: "claude-sonnet", providerId: "claude-code", content: "", turnId: TURN, parts };
}

let providerCalls: Array<Record<string, unknown>> = [];
let providerResult: { ok: boolean; message?: string } = { ok: true };

function setWindow() {
  const values = new Map<string, string>();
  (globalThis as { window: unknown }).window = {
    api: {
      provider: {
        respondApproval: async (args: Record<string, unknown>) => { providerCalls.push({ kind: "approval", ...args }); return providerResult; },
        respondUserInput: async (args: Record<string, unknown>) => { providerCalls.push({ kind: "question", ...args }); return providerResult; },
      },
    },
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
      clear: () => values.clear(),
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

async function seed(args: { approval?: ApprovalPart; controlMode?: "interactive" | "managed"; controlOwner?: "stave" | "external" } = {}) {
  const { useAppStore } = await import("@/store/app.store");
  const initial = useAppStore.getInitialState();
  useAppStore.setState({
    ...initial,
    hasHydratedWorkspaces: true,
    repositoryPath: "/tmp/stave-remote",
    repositoryName: "stave-remote",
    workspaces: [{ id: WORKSPACE, name: "main", updatedAt: "2026-11-01T00:00:00.000Z" }],
    activeWorkspaceId: WORKSPACE,
    activeTaskId: TASK,
    workspacePathById: { [WORKSPACE]: "/tmp/stave-remote" },
    workspaceBranchById: { [WORKSPACE]: "main" },
    workspaceDefaultById: { [WORKSPACE]: true },
    tasks: [{
      id: TASK, title: "Fix the build", provider: "claude-code", updatedAt: "2026-11-01T00:00:00.000Z",
      unread: false, archivedAt: null, controlMode: args.controlMode ?? "interactive", controlOwner: args.controlOwner ?? "stave",
    }],
    messagesByTask: {
      [TASK]: [message("message-approval", [args.approval ?? pendingApproval]), message("message-question", [pendingQuestion])],
    },
    activeTurnIdsByTask: { [TASK]: TURN },
    hostOwnedTurnIdsByTask: {},
    taskWorkspaceIdById: { [TASK]: WORKSPACE },
  } as never);
  return useAppStore;
}

let db: Database;
let runtime: RemoteControlRuntime;
let rendererPresent: boolean;
let teardownResponder: () => void = () => undefined;
let portSeq = 0;

async function start() {
  db = new Database(":memory:");
  db.exec("CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)");
  const store = new RemoteControlStore(db);
  let listener: ((request: unknown) => void) | undefined;
  const target: RemoteRendererTarget = {
    id: 7,
    // Electron IPC serializes payloads; a structured clone stands in for it.
    send: (_channel, payload) => queueMicrotask(() => listener?.(structuredClone(payload))),
  };
  runtime = createRemoteControlRuntime({
    store,
    getTarget: () => (rendererPresent ? target : null),
    asset: createRemoteMobileAssets(() => ({
      locale: "en",
      copy: Object.fromEntries(REMOTE_MOBILE_COPY_KEYS.map((key) => [key, key])) as never,
    })),
    rendererTimeoutMs: 2_000,
  });
  const { installRemoteControlResponder } = await import("@/lib/remote-control-responder");
  const api: RemoteControlApi = {
    invoke: (args) => runtime.admin(args),
    onRequest: (next) => { listener = next; return () => { listener = undefined; }; },
    respond: async (response) => runtime.bridge.resolve(target.id, structuredClone(response)),
    setResponderReady: async () => ({ ok: true }),
  };
  teardownResponder = installRemoteControlResponder(api);
  // Each test closes its listener, so ports in the allowed range are reused.
  const port = 6520 + (portSeq++ % 30);
  const configured = await runtime.admin({ kind: "configure", config: { enabled: true, port } });
  expect(configured.ok).toBe(true);
  const base = `http://127.0.0.1:${port}`;
  const post = (path: string, body: unknown, token?: string) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  const pairing = await runtime.admin({ kind: "pair" });
  if (!pairing.ok || !pairing.pairing) throw new Error("pairing failed");
  const paired = await post("/api/pair", { code: pairing.pairing.code, name: "Phone" });
  expect(paired.status).toBe(200);
  const { token } = (await paired.json()) as { token: string };
  const state = () => fetch(base + "/api/state", { headers: { Authorization: `Bearer ${token}` } });
  const act = async (body: unknown) => {
    const response = await post("/api/action", body, token);
    return { status: response.status, body: response.status === 200 ? await response.json() : null };
  };
  return { base, post, token, state, act };
}

const approval = (approved: boolean, overrides: Record<string, unknown> = {}) => ({
  kind: "approval", workspaceId: WORKSPACE, taskId: TASK, turnId: TURN, requestId: "approval-1", messageId: "message-approval", approved, ...overrides,
});

beforeEach(() => {
  providerCalls = [];
  providerResult = { ok: true };
  rendererPresent = true;
  setWindow();
});

afterEach(async () => {
  teardownResponder();
  await runtime?.close();
  db?.close();
  const { useAppStore } = await import("@/store/app.store");
  useAppStore.setState(useAppStore.getInitialState(), true);
  (globalThis as { window: unknown }).window = originalWindow;
});

describe("remote control through the desktop's respond actions", () => {
  test("the snapshot lists the running task and its pending requests", async () => {
    await seed();
    const s = await start();
    const response = await s.state();
    expect(response.status).toBe(200);
    const snapshot = await response.json();
    expect(snapshot.tasks).toEqual([
      { workspaceId: WORKSPACE, workspaceName: "main", taskId: TASK, turnId: TURN, title: "Fix the build", updatedAt: "2026-11-01T00:00:00.000Z", running: true },
    ]);
    expect(snapshot.requests).toEqual([
      { workspaceId: WORKSPACE, taskId: TASK, turnId: TURN, kind: "approval", requestId: "approval-1", messageId: "message-approval", tool: "Bash", summary: "Run the type check\n\nbun run typecheck", questions: [] },
      {
        workspaceId: WORKSPACE, taskId: TASK, turnId: TURN, kind: "question", requestId: "question-1", messageId: "message-question", tool: "AskUserQuestion", summary: "",
        questions: [{ key: "Which branch?", question: "Which branch?", options: [{ label: "Main", value: "main" }, { label: "Release", value: "Release" }], multiSelect: false, required: true }],
      },
    ]);
  });

  test("approve applies once through the provider, like a desktop click", async () => {
    const store = await seed();
    const s = await start();
    expect(await s.act(approval(true))).toEqual({ status: 200, body: { ok: true, reason: "applied" } });
    expect(providerCalls).toEqual([{ kind: "approval", turnId: TURN, requestId: "approval-1", approved: true }]);
    const part = store.getState().messagesByTask[TASK]?.[0]?.parts[0] as ApprovalPart;
    expect(part.state).toBe("approval-responded");
    expect(part.resolution).toMatchObject({ decision: "allowed", source: "user", scope: "once" });
    // Replaying the same request never reaches the provider again.
    expect(await s.act(approval(true))).toEqual({ status: 200, body: { ok: false, reason: "expired" } });
    expect(providerCalls).toHaveLength(1);
  });

  test("a request already answered on the desktop is expired", async () => {
    await seed({ approval: { ...pendingApproval, state: "approval-responded" } });
    const s = await start();
    expect(await s.act(approval(false))).toEqual({ status: 200, body: { ok: false, reason: "expired" } });
    expect(providerCalls).toEqual([]);
  });

  test("a request for an old turn is expired", async () => {
    await seed();
    const s = await start();
    expect(await s.act(approval(true, { turnId: "turn-old" }))).toEqual({ status: 200, body: { ok: false, reason: "expired" } });
    expect(providerCalls).toEqual([]);
  });

  test("an unknown request is invalid", async () => {
    await seed();
    const s = await start();
    expect(await s.act(approval(true, { requestId: "approval-unknown" }))).toEqual({ status: 200, body: { ok: false, reason: "invalid" } });
    expect(await s.act(approval(true, { workspaceId: "ws-unknown" }))).toEqual({ status: 200, body: { ok: false, reason: "invalid" } });
    expect(providerCalls).toEqual([]);
  });

  test("work owned by an external controller is neither listed nor answerable", async () => {
    await seed({ controlMode: "managed", controlOwner: "external" });
    const s = await start();
    const snapshot = await (await s.state()).json();
    expect(snapshot.requests).toEqual([]);
    expect(await s.act(approval(true))).toEqual({ status: 200, body: { ok: false, reason: "invalid" } });
    expect(providerCalls).toEqual([]);
  });

  test("without a ready desktop window the answer is unavailable and can be retried", async () => {
    await seed();
    const s = await start();
    rendererPresent = false;
    expect((await s.state()).status).toBe(503);
    expect(await s.act(approval(true))).toEqual({ status: 200, body: { ok: false, reason: "unavailable" } });
    expect(providerCalls).toEqual([]);
    rendererPresent = true;
    expect(await s.act(approval(true))).toEqual({ status: 200, body: { ok: true, reason: "applied" } });
  });

  test("a failed provider delivery is unavailable", async () => {
    await seed();
    providerResult = { ok: false, message: "runtime gone" };
    const s = await start();
    expect(await s.act(approval(true))).toEqual({ status: 200, body: { ok: false, reason: "unavailable" } });
  });

  test("a question answer applies with option values and the audit keeps no answer text", async () => {
    const store = await seed();
    const s = await start();
    const answer = { kind: "question", workspaceId: WORKSPACE, taskId: TASK, turnId: TURN, requestId: "question-1", messageId: "message-question", answers: { "Which branch?": "main-secret-value" } };
    expect(await s.act({ ...answer, answers: { "Not a question": "x" } })).toEqual({ status: 200, body: { ok: false, reason: "invalid" } });
    // The invalid attempt settled that request for this boundary; a fresh request id shows the applied path.
    store.setState((state) => ({
      messagesByTask: {
        ...state.messagesByTask,
        [TASK]: [state.messagesByTask[TASK]![0]!, message("message-question-2", [{ ...pendingQuestion, requestId: "question-2" }])],
      },
    }));
    expect(await s.act({ ...answer, requestId: "question-2", messageId: "message-question-2" })).toEqual({ status: 200, body: { ok: true, reason: "applied" } });
    expect(providerCalls).toEqual([{ kind: "question", turnId: TURN, requestId: "question-2", answers: { "Which branch?": "main-secret-value" } }]);
    const rows = JSON.stringify(db.prepare("SELECT * FROM remote_control_audit").all());
    expect(rows).toContain("question-2");
    expect(rows).not.toContain("main-secret-value");
    const status = await runtime.admin({ kind: "status" });
    expect(JSON.stringify(status)).not.toContain("main-secret-value");
  });

  test("a revoked device is refused; stop is not an action; tokens are never stored", async () => {
    await seed();
    const s = await start();
    expect((await s.post("/api/action", { kind: "stop", workspaceId: WORKSPACE, taskId: TASK, turnId: TURN }, s.token)).status).toBe(400);
    expect(JSON.stringify(db.prepare("SELECT * FROM remote_control_devices").all())).not.toContain(s.token);
    expect((await runtime.admin({ kind: "revoke" })).ok).toBe(true);
    expect((await s.state()).status).toBe(401);
    expect((await s.post("/api/action", approval(true), s.token)).status).toBe(401);
    expect(providerCalls).toEqual([]);
  });

  test("admin refuses an unconfirmed network address and keeps the listener on loopback", async () => {
    await seed();
    await start();
    const result = await runtime.admin({ kind: "configure", config: { enabled: true, address: "192.0.2.10", port: 6549 } });
    expect(result).toMatchObject({ ok: false, error: "invalid-address" });
    expect(result.status).toMatchObject({ enabled: true, address: "127.0.0.1" });
    expect(await runtime.admin({ kind: "configure", config: { enabled: true, address: "0.0.0.0", port: 6549, confirmNetwork: true } })).toMatchObject({ ok: false, error: "invalid-address" });
    expect(await runtime.admin({ kind: "stop" })).toMatchObject({ ok: false, error: "invalid-request" });
  });

  test("the mobile page is served under a strict policy and its script parses", async () => {
    await seed();
    const s = await start();
    const page = await fetch(s.base + "/");
    expect(page.status).toBe(200);
    const policy = page.headers.get("content-security-policy") ?? "";
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
    const html = await page.text();
    expect(html).not.toMatch(/<script>(?!<)/);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect((await fetch(s.base + "/assets/remote.js")).headers.get("content-type")).toContain("text/javascript");
    const copy = await (await fetch(s.base + "/assets/remote-copy.json")).json();
    expect(Object.keys(copy.copy)).toEqual([...REMOTE_MOBILE_COPY_KEYS]);
    expect(REMOTE_MOBILE_JS).not.toMatch(/innerHTML|eval\(|new Function|sessionStorage\.setItem\("[^"]*", *code/);
    expect(REMOTE_MOBILE_JS).toContain("sessionStorage");
    // Syntax check only; the script is never run here.
    expect(() => new Function(REMOTE_MOBILE_JS)).not.toThrow();
  });
});
