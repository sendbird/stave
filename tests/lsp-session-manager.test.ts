import { afterEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

const actualChildProcess = await import("node:child_process");

class FakeStream extends EventEmitter {}

class FakeChild extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  stdin = {
    write: (payload: string) => {
      const body = payload.split("\r\n\r\n")[1] ?? "";
      const message = JSON.parse(body) as { id?: number; method?: string };
      if (message.method === "initialize" && typeof message.id === "number") {
        const responseBody = JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: { capabilities: {} },
        });
        this.stdout.emit(
          "data",
          `Content-Length: ${Buffer.byteLength(responseBody, "utf8")}\r\n\r\n${responseBody}`,
        );
      }
      return true;
    },
  };

  kill() {
    this.emit("exit", 0, null);
    return true;
  }
}

const fakeChildren: FakeChild[] = [];

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
