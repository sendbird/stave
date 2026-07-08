import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

// Mid-turn steering: providerRuntime.steerTurn must deliver a follow-up into
// the live turn's registered steer responder, surface a diagnostic when there
// is no active session, and — critically — never delete the active session on
// success (the turn keeps streaming, so abort/steer-again must still work).

const actualClaudeRuntime = await import(
  "../electron/providers/claude-sdk-runtime"
);
const actualCodexAppServerRuntime = await import(
  "../electron/providers/codex-app-server-runtime"
);

type SteerResponder = (args: {
  text: string;
}) => Promise<
  | { ok: true }
  | { ok: false; reason: "turn-not-steerable"; pendingRequestIds: string[] }
>;

type Holder = {
  steeredTexts: string[];
  rejectSteer: boolean;
  release?: () => void;
};

const holder: Holder = { steeredTexts: [], rejectSteer: false };

mock.module("../electron/providers/claude-sdk-runtime", () => ({
  ...actualClaudeRuntime,
  buildClaudeEnv: () => ({}),
  cleanupClaudeTask: () => {},
  getClaudeCommandCatalog: async () => ({
    ok: true,
    supported: true,
    commands: [],
    detail: "",
  }),
  resolveClaudeExecutablePath: () => "/tmp/claude",
  streamClaudeWithSdk: async (args: {
    onEvent?: (event: { type: string }) => void;
    registerAbort?: (aborter: () => void) => void;
    registerSteerResponder?: (responder: SteerResponder) => void;
  }) => {
    args.registerAbort?.(() => {
      holder.release?.();
    });
    args.registerSteerResponder?.(async ({ text }) => {
      if (holder.rejectSteer) {
        return {
          ok: false,
          reason: "turn-not-steerable",
          pendingRequestIds: [],
        };
      }
      holder.steeredTexts.push(text);
      return { ok: true };
    });
    // Keep the turn open until release() so steerTurn fires against a live
    // active session.
    await new Promise<void>((resolve) => {
      holder.release = resolve;
    });
    args.onEvent?.({ type: "done" });
    return [{ type: "done" }];
  },
}));

mock.module("../electron/providers/codex-app-server-runtime", () => ({
  ...actualCodexAppServerRuntime,
  cleanupCodexAppServerTask: () => {},
  resolveCodexExecutablePath: () => "/tmp/codex",
  streamCodexWithAppServer: async (args: {
    onEvent?: (event: { type: string }) => void;
  }) => {
    args.onEvent?.({ type: "done" });
    return [{ type: "done" }];
  },
}));

mock.module("../electron/providers/connected-tool-status", () => ({
  getProviderConnectedToolStatus: async () => ({
    ok: true,
    detail: "",
    tools: [],
  }),
}));

const { providerRuntime } = await import("../electron/providers/runtime");

beforeAll(() => {
  process.env.STAVE_ENABLE_MID_TURN_STEERING = "1";
});

afterEach(async () => {
  holder.release?.();
  holder.release = undefined;
  holder.steeredTexts = [];
  holder.rejectSteer = false;
  await providerRuntime.shutdown();
});

describe("providerRuntime.steerTurn", () => {
  test("no active session for turnId returns ok:false with diagnostic", async () => {
    const result = await providerRuntime.steerTurn({
      turnId: "ghost-turn",
      text: "hello",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("No active steer responder");
    expect(result.message).toContain("ghost-turn");
  });

  test("active session but responder rejects returns ok:false", async () => {
    holder.rejectSteer = true;
    const turnId = "turn-steer-reject";
    const started = providerRuntime.startTurnStream(
      { providerId: "claude-code", prompt: "run", turnId },
      { bufferEvents: true },
    );
    expect(started.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = await providerRuntime.steerTurn({ turnId, text: "extra" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("turn not steerable");
    holder.release?.();
  });

  test("success delivers text and keeps the active session alive", async () => {
    const turnId = "turn-steer-ok";
    const started = providerRuntime.startTurnStream(
      { providerId: "claude-code", prompt: "run", turnId },
      { bufferEvents: true },
    );
    expect(started.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const first = await providerRuntime.steerTurn({ turnId, text: "first" });
    expect(first.ok).toBe(true);
    expect(holder.steeredTexts).toEqual(["first"]);

    // The session must NOT have been deleted — a second steer into the same
    // still-running turn must also succeed.
    const second = await providerRuntime.steerTurn({ turnId, text: "second" });
    expect(second.ok).toBe(true);
    expect(holder.steeredTexts).toEqual(["first", "second"]);

    // And aborting the still-active turn must succeed too.
    const abort = providerRuntime.abortTurn({ turnId });
    expect(abort.ok).toBe(true);
    holder.release?.();
  });

  test("disabled via env flag returns ok:false without touching the responder", async () => {
    process.env.STAVE_ENABLE_MID_TURN_STEERING = "";
    const turnId = "turn-steer-disabled";
    const started = providerRuntime.startTurnStream(
      { providerId: "claude-code", prompt: "run", turnId },
      { bufferEvents: true },
    );
    expect(started.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = await providerRuntime.steerTurn({ turnId, text: "nope" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("STAVE_ENABLE_MID_TURN_STEERING");
    expect(holder.steeredTexts).toEqual([]);
    holder.release?.();
    process.env.STAVE_ENABLE_MID_TURN_STEERING = "1";
  });

  test("settings.midTurnSteeringEnabled (enabled:true) works even when the env flag is off", async () => {
    process.env.STAVE_ENABLE_MID_TURN_STEERING = "";
    const turnId = "turn-steer-setting-enabled";
    const started = providerRuntime.startTurnStream(
      { providerId: "claude-code", prompt: "run", turnId },
      { bufferEvents: true },
    );
    expect(started.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = await providerRuntime.steerTurn({
      turnId,
      text: "from-setting",
      enabled: true,
    });
    expect(result.ok).toBe(true);
    expect(holder.steeredTexts).toEqual(["from-setting"]);
    holder.release?.();
    process.env.STAVE_ENABLE_MID_TURN_STEERING = "1";
  });

  test("enabled:false with the env flag off still returns ok:false", async () => {
    process.env.STAVE_ENABLE_MID_TURN_STEERING = "";
    const turnId = "turn-steer-setting-disabled";
    const started = providerRuntime.startTurnStream(
      { providerId: "claude-code", prompt: "run", turnId },
      { bufferEvents: true },
    );
    expect(started.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = await providerRuntime.steerTurn({
      turnId,
      text: "nope",
      enabled: false,
    });
    expect(result.ok).toBe(false);
    expect(holder.steeredTexts).toEqual([]);
    holder.release?.();
    process.env.STAVE_ENABLE_MID_TURN_STEERING = "1";
  });
});
