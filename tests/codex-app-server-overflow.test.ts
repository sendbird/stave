import { afterEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

const actualChildProcess = await import("node:child_process");

const SOFT_LINE_MAX_BYTES = 1 * 1024 * 1024;

class FakeStream extends EventEmitter {
  setEncoding(_encoding: string) {}
}

type FakeScenario = "oversized-valid-response" | "oversized-invalid-response";

class FakeChild extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  killed = false;

  constructor(private readonly scenario: FakeScenario) {
    super();
  }

  stdin = {
    write: (payload: string) => {
      const lines = payload
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        const message = JSON.parse(line) as {
          id?: number;
          method?: string;
        };

        if (message.method === "initialize" && typeof message.id === "number") {
          this.emitJson({
            jsonrpc: "2.0",
            id: message.id,
            result: { capabilities: {} },
          });
          continue;
        }

        if (
          message.method === "mcpServerStatus/list" &&
          typeof message.id === "number"
        ) {
          if (this.scenario === "oversized-valid-response") {
            this.emitJson({
              jsonrpc: "2.0",
              id: message.id,
              result: {
                data: [{ name: "slack", authStatus: "oAuth" }],
                debug: "x".repeat(SOFT_LINE_MAX_BYTES + 512),
              },
            });
            continue;
          }

          this.stdout.emit(
            "data",
            `{"jsonrpc":"2.0","id":${message.id},"result":{"data":[{"name":"slack","authStatus":"oAuth"}],"debug":"${"x".repeat(SOFT_LINE_MAX_BYTES + 512)}\n`,
          );
        }
      }

      return true;
    },
  };

  kill() {
    this.killed = true;
    return true;
  }

  private emitJson(message: unknown) {
    this.stdout.emit("data", `${JSON.stringify(message)}\n`);
  }
}

const fakeChildren: FakeChild[] = [];
let nextScenario: FakeScenario = "oversized-valid-response";

mock.module("node:child_process", () => ({
  ...actualChildProcess,
  spawn: () => {
    const child = new FakeChild(nextScenario);
    fakeChildren.push(child);
    return child;
  },
}));

afterEach(() => {
  fakeChildren.length = 0;
  nextScenario = "oversized-valid-response";
  mock.restore();
});

async function getCodexConnectedToolStatus(
  args: Parameters<
    typeof import("../electron/providers/codex-app-server-runtime").getCodexConnectedToolStatus
  >[0],
) {
  const runtime = await import(
    `../electron/providers/codex-app-server-runtime?overflow-test=${Date.now()}-${Math.random()}`
  );
  return runtime.getCodexConnectedToolStatus(args);
}

describe("codex app server stdout overflow handling", () => {
  test("accepts valid oversized JSON-RPC responses without tearing down the process", async () => {
    nextScenario = "oversized-valid-response";

    const result = await getCodexConnectedToolStatus({
      runtimeOptions: {
        codexBinaryPath: "/tmp/fake-codex-valid-overflow",
      },
      toolIds: ["slack"],
    });

    expect(result.ok).toBe(true);
    expect(result.tools).toEqual([
      {
        id: "slack",
        label: "Slack",
        state: "ready",
        available: true,
        detail: "Slack is ready for Codex.",
      },
    ]);
    expect(fakeChildren[0]?.killed).toBe(false);
  });

  test("fails the request when an oversized stdout line is malformed JSON-RPC", async () => {
    nextScenario = "oversized-invalid-response";

    const result = await getCodexConnectedToolStatus({
      runtimeOptions: {
        codexBinaryPath: "/tmp/fake-codex-invalid-overflow",
      },
      toolIds: ["slack"],
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain("oversized line");
    expect(fakeChildren[0]?.killed).toBe(true);
  });
});
