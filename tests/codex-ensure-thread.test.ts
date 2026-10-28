import { describe, expect, test } from "bun:test";
import { ensureCodexThread } from "../electron/providers/codex-ensure-thread";

type StartCall = { method: string; model?: string; threadId?: string };

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
      const threadId =
        params && typeof params === "object" && "threadId" in params
          && typeof params.threadId === "string"
          ? params.threadId
          : undefined;
      const call = { method, model, ...(threadId ? { threadId } : {}) };
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

describe("Codex same-rung model fallback", () => {
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

  test("retries an unavailable GPT-6.1 Terra once on GPT-5.6 Terra", async () => {
    const { calls, client } = fakeClient({
      fail: (call) =>
        call.model === "gpt-6.1-terra" ? "model gpt-6.1-terra is not available with this account" : undefined,
    });
    const started = await start("terra-61-fallback", "gpt-6.1-terra", client);
    expect(calls.map((call) => call.model)).toEqual(["gpt-6.1-terra", "gpt-5.6-terra"]);
    expect(started.fallbackModel).toBe("gpt-5.6-terra");
    expect(started.resolvedModel).toBe("gpt-5.6-terra");
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

describe("Codex fresh thread (an Agent run's account-pool switch)", () => {
  test("resumes neither the cached thread nor the stored one, and later turns resume the new thread", async () => {
    const { calls, client } = fakeClient({ fail: () => undefined });
    const taskId = "fresh-thread-after-account-switch";
    const first = await start(taskId, "gpt-6-sol", client);
    expect(calls.at(-1)).toMatchObject({ method: "thread/start" });
    // An ordinary turn resumes the thread this account already has.
    await start(taskId, "gpt-6-sol", client);
    expect(calls.at(-1)).toMatchObject({ method: "thread/resume", threadId: first.threadId });

    const fresh = await ensureCodexThread({
      client, executablePath: "/tmp/fake-codex", taskId, cwd: process.cwd(), input: "hello",
      runtimeOptions: { model: "gpt-6-sol" }, fresh: true,
      conversation: { input: { content: "hello" }, resume: { nativeSessionId: first.threadId } } as unknown as
        NonNullable<Parameters<typeof ensureCodexThread>[0]["conversation"]>,
    });
    expect(calls.at(-1)).toMatchObject({ method: "thread/start" });
    expect(fresh.resumedThreadId).toBeNull();

    await start(taskId, "gpt-6-sol", client);
    expect(calls.at(-1)).toMatchObject({ method: "thread/resume", threadId: fresh.threadId });
  });
});
