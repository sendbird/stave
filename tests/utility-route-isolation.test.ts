import { describe, expect, test } from "bun:test";
import {
  cancelUtilityRouteClassification,
  classifyUtilityRoute,
  type UtilityInferenceRunners,
} from "../electron/providers/utility-inference";

const valid = JSON.stringify({
  version: 1, intent: "implement", complexity: "low", risk: "normal",
  continuity: "new", evidenceCodes: [],
});

function runnersWith(
  codex: UtilityInferenceRunners["codex"],
  fallback: UtilityInferenceRunners["codex"] = async () => ({ ok: false }),
): UtilityInferenceRunners {
  return { codex, "claude-code": fallback, cursor: fallback, kiro: fallback };
}

describe("utility route classification isolation", () => {
  test("forwards only binary paths to a classification runner", async () => {
    let calls = 0;
    let received: Parameters<UtilityInferenceRunners["codex"]>[0] | undefined;
    const result = await classifyUtilityRoute({
      prompt: "Implement the requested change",
      utilityProviderId: "codex",
      runtimeOptions: {
        claudeBinaryPath: "/tmp/claude", codexBinaryPath: "/tmp/codex",
        cursorBinaryPath: "/tmp/cursor", kiroBinaryPath: "/tmp/kiro",
        boundSecretIds: ["secret-id"], codexResumeThreadId: "thread-id",
      },
    }, runnersWith(async (args) => {
      calls++;
      received = args;
      return { ok: true, text: valid };
    }));
    expect(result.ok).toBe(true);
    expect(calls).toBe(1);
    expect(received?.routeClassification).toBe(true);
    expect(received?.signal?.aborted).toBe(false);
    expect(received?.runtimeOptions).toEqual({
      claudeBinaryPath: "/tmp/claude", codexBinaryPath: "/tmp/codex",
      cursorBinaryPath: "/tmp/cursor", kiroBinaryPath: "/tmp/kiro",
    });
  });

  test("invalid classifier JSON does not fan out to another provider", async () => {
    const calls: string[] = [];
    const result = await classifyUtilityRoute({ prompt: "Implement this", utilityProviderId: "codex" }, runnersWith(
      async () => { calls.push("codex"); return { ok: true, text: "invalid" }; },
      async () => { calls.push("fallback"); return { ok: true, text: valid }; },
    ));
    expect(result.ok).toBe(false);
    expect(calls).toEqual(["codex"]);
  });

  test("a configured model selects its own provider and does not fall through on auth failure", async () => {
    const calls: string[] = [];
    const runners = runnersWith(
      async () => { calls.push("codex"); return { ok: true, text: valid }; },
      async () => { calls.push("claude"); return { ok: true, text: valid }; },
    );
    const configured = await classifyUtilityRoute({
      prompt: "Explain this", utilityProviderId: "auto", utilityModel: "claude-haiku-4-5",
    }, runners, async () => ({ ready: true }));
    expect(configured.ok).toBe(true);
    expect(calls).toEqual(["claude"]);
    calls.length = 0;
    const unavailable = await classifyUtilityRoute({
      prompt: "Explain this", utilityProviderId: "codex",
    }, runners, async () => ({ ready: false, detail: "Unavailable" }));
    expect(unavailable.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  test("cancellation reaches the running classifier without a fallback call", async () => {
    const requestId = "00000000-0000-4000-8000-000000000001";
    const calls: string[] = [];
    let signal: AbortSignal | undefined;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const result = classifyUtilityRoute({ requestId, prompt: "Implement this", utilityProviderId: "codex" }, runnersWith(
      async (args) => {
        calls.push("codex");
        signal = args.signal;
        markStarted();
        if (!args.signal) return { ok: false };
        return new Promise<{ ok: boolean; aborted: boolean }>((resolve) => {
          const abort = () => resolve({ ok: false, aborted: true });
          if (args.signal?.aborted) abort();
          else args.signal?.addEventListener("abort", abort, { once: true });
        });
      },
      async () => { calls.push("fallback"); return { ok: true, text: valid }; },
    ));
    await started;
    cancelUtilityRouteClassification(requestId);
    expect((await result).ok).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(calls).toEqual(["codex"]);
  });
});
