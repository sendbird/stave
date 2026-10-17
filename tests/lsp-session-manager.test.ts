import { afterEach, describe, expect, jest, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

const actualChildProcess = await import("node:child_process");

class FakeStream extends EventEmitter {}

interface FakeJsonRpcMessage {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
}

class FakeChild extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  written: FakeJsonRpcMessage[] = [];
  stdin = {
    write: (payload: string) => {
      const body = payload.split("\r\n\r\n")[1] ?? "";
      const message = JSON.parse(body) as FakeJsonRpcMessage;
      this.written.push(message);
      if (message.method === "initialize" && typeof message.id === "number") {
        this.serverSend({
          jsonrpc: "2.0",
          id: message.id,
          result: { capabilities: {} },
        } as FakeJsonRpcMessage);
        return true;
      }
      onClientMessage?.(this, message);
      return true;
    },
  };

  serverSend(message: FakeJsonRpcMessage) {
    const responseBody = JSON.stringify({ jsonrpc: "2.0", ...message });
    this.stdout.emit(
      "data",
      `Content-Length: ${Buffer.byteLength(responseBody, "utf8")}\r\n\r\n${responseBody}`,
    );
  }

  killed = false;

  kill() {
    this.killed = true;
    if (!deferExitOnKill) {
      this.emit("exit", 0, null);
    }
    return true;
  }
}

const fakeChildren: FakeChild[] = [];
let deferExitOnKill = false;
let onClientMessage: ((child: FakeChild, message: FakeJsonRpcMessage) => void) | null = null;

mock.module("node:child_process", () => ({
  ...actualChildProcess,
  spawn: () => {
    const child = new FakeChild();
    fakeChildren.push(child);
    return child;
  },
}));

mock.module("../electron/main/lsp/server-registry", () => ({
  resolveLspServer: () => ({
    ok: true,
    server: {
      languageId: "typescript",
      displayName: "fake-typescript-language-server",
      command: "fake-typescript-language-server",
      args: ["--stdio"],
      detail: "fake-typescript-language-server",
    },
  }),
}));

const {
  requestLspHover,
  stopLspSessions,
  syncLspDocument,
} = await import("../electron/main/lsp/session-manager");

class FakeSender extends EventEmitter {
  id: number;

  constructor(id: number) {
    super();
    this.id = id;
  }

  isDestroyed() {
    return false;
  }

  send() {}
}

afterEach(async () => {
  jest.useRealTimers();
  deferExitOnKill = false;
  onClientMessage = null;
  await stopLspSessions({});
  fakeChildren.length = 0;
  mock.restore();
});

describe("lsp session manager subscriptions", () => {
  test("does not add duplicate destroyed listeners for the same sender and session", async () => {
    const sender = new FakeSender(1001);
    const baseArgs = {
      rootPath: "/tmp/workspace",
      languageId: "typescript" as const,
      sender,
      filePath: "/tmp/workspace/src/index.ts",
      documentLanguageId: "typescript",
      text: "const x = 1;\n",
      version: 1,
    };

    const first = await syncLspDocument(baseArgs);
    const second = await syncLspDocument({
      ...baseArgs,
      text: "const x = 2;\n",
      version: 2,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(sender.listenerCount("destroyed")).toBe(1);
  });
});

describe("lsp session manager lifecycle", () => {
  test("keeps a restarted session when the previous server exits late", async () => {
    const sender = new FakeSender(2001);
    const baseArgs = {
      rootPath: "/tmp/workspace-restart",
      languageId: "typescript" as const,
      sender,
      filePath: "/tmp/workspace-restart/src/index.ts",
      documentLanguageId: "typescript",
      text: "const x = 1;\n",
      version: 1,
    };

    expect((await syncLspDocument(baseArgs)).ok).toBe(true);
    const oldChild = fakeChildren[0]!;

    deferExitOnKill = true;
    await stopLspSessions({ rootPath: baseArgs.rootPath });
    expect(oldChild.killed).toBe(true);

    expect((await syncLspDocument(baseArgs)).ok).toBe(true);
    expect(fakeChildren).toHaveLength(2);
    const newChild = fakeChildren[1]!;

    oldChild.emit("exit", 0, "SIGTERM");

    expect((await syncLspDocument({ ...baseArgs, version: 2 })).ok).toBe(true);
    expect(fakeChildren).toHaveLength(2);

    await stopLspSessions({ rootPath: baseArgs.rootPath });
    expect(newChild.killed).toBe(true);
  });
});

describe("lsp session manager json-rpc", () => {
  const hoverArgs = (rootPath: string, senderId: number) => ({
    rootPath,
    languageId: "typescript" as const,
    sender: new FakeSender(senderId),
    filePath: `${rootPath}/src/index.ts`,
    line: 0,
    character: 0,
  });

  test("answers server requests without settling a client request that shares the id", async () => {
    onClientMessage = (child, message) => {
      if (message.method !== "textDocument/hover" || typeof message.id !== "number") {
        return;
      }
      child.serverSend({ id: message.id, method: "workspace/configuration", params: { items: [{}, {}] } });
      child.serverSend({ id: message.id, method: "custom/unknownRequest" });
      child.serverSend({ id: message.id, result: { contents: "real hover" } });
    };

    const result = await requestLspHover(hoverArgs("/tmp/workspace-server-request", 3001));

    expect(result).toEqual({ ok: true, value: { contents: "real hover" } });
    const replies = fakeChildren[0]!.written.filter((message) => message.method === undefined);
    expect(replies.map(({ result: value, error }) => ({ result: value, code: error?.code }))).toEqual([
      { result: [null, null], code: undefined },
      { result: undefined, code: -32601 },
    ]);
  });

  test("times out an unanswered request, forgets it, and cancels it on the server", async () => {
    expect((await syncLspDocument({
      ...hoverArgs("/tmp/workspace-timeout", 3002),
      documentLanguageId: "typescript",
      text: "",
      version: 1,
    })).ok).toBe(true);

    jest.useFakeTimers();
    const pending = requestLspHover(hoverArgs("/tmp/workspace-timeout", 3002));
    await Promise.resolve();
    const hoverRequest = fakeChildren[0]!.written.find((message) => message.method === "textDocument/hover");
    expect(hoverRequest?.id).toBeNumber();

    jest.advanceTimersByTime(15_001);
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.detail).toContain("timed out");
    expect(fakeChildren[0]!.written.at(-1)).toMatchObject({
      method: "$/cancelRequest",
      params: { id: hoverRequest?.id },
    });

    // A late response for the forgotten id is ignored.
    fakeChildren[0]!.serverSend({ id: hoverRequest?.id, result: { contents: "late" } });
  });
});
