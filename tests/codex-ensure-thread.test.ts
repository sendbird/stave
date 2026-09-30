import { describe, expect, test } from "bun:test";
import { ensureCodexThread } from "../electron/providers/codex-ensure-thread";

type StartCall = { method: string; model?: string };

function fakeClient(args: {
  fail: (call: StartCall) => string | undefined;
}) {
  const calls: StartCall[] = [];
  const client = {
    async request<T>(method: string, params: unknown): Promise<T> {
      const model =
        params && typeof params === "object" && "model" in params
          && typeof params.model === "string"
          ? params.model
          : undefined;
      const call = { method, model };
      calls.push(call);
      const message = args.fail(call);
      if (message) throw new Error(message);
      return { thread: { id: `thread-${calls.length}` }, model } as T;
    },
    threadLifetime: {
      async acquire() {
        return () => {};
      },
    },
  };
  return { calls, client };
}

function start(taskId: string, model: string, client: ReturnType<typeof fakeClient>["client"]) {
  return ensureCodexThread({
    client,
    executablePath: "/tmp/fake-codex",
    taskId,
    cwd: process.cwd(),
    input: "hello",
    runtimeOptions: { model },
  });
}

describe("Codex Sol fallback", () => {
  test("retries an unavailable GPT-6.1 Sol once on GPT-6 Sol", async () => {
    const { calls, client } = fakeClient({
      fail: (call) =>
        call.model === "gpt-6.1-sol" ? "model gpt-6.1-sol is not supported" : undefined,
    });
    const started = await start("sol-61-fallback", "gpt-6.1-sol", client);
    expect(calls.map((call) => call.model)).toEqual(["gpt-6.1-sol", "gpt-6-sol"]);
    expect(started.fallbackModel).toBe("gpt-6-sol");
    expect(started.resolvedModel).toBe("gpt-6-sol");
    expect(started.threadId).toBe("thread-2");
  });

  test("does not retry a second time or a different model", async () => {
    const unavailable = fakeClient({
      fail: () => "model is not supported with this account",
    });
    await expect(start("sol-61-still-unavailable", "gpt-6.1-sol", unavailable.client))
      .rejects.toThrow(/not supported/);
    expect(unavailable.calls).toHaveLength(2);

    const overload = fakeClient({
      fail: () => "the model is overloaded",
    });
    await expect(start("sol-61-overloaded", "gpt-6.1-sol", overload.client))
      .rejects.toThrow(/overloaded/);
    expect(overload.calls).toHaveLength(1);

    const astra = fakeClient({
      fail: () => "model gpt-6-astra is not available",
    });
    await expect(start("astra-unavailable", "gpt-6-astra", astra.client))
      .rejects.toThrow(/not available/);
    expect(astra.calls).toHaveLength(1);
  });
});
