import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { launchStave, type StaveApp } from "./harness/stave-app";

test.skip(
  process.env.STAVE_LIVE_PROVIDER_SMOKE !== "1",
  "Requires an explicit opt-in because it makes authenticated provider turns.",
);

for (const providerId of ["claude-code", "codex"] as const) {
  test(`live ${providerId} adapter answers a tiny read-only turn`, async () => {
    test.setTimeout(150_000);
    const projectPath = await mkdtemp(path.join(tmpdir(), "stave-provider-smoke-"));
    const stave = await launchStave();
    try {
      const result = await stave.page.evaluate(async ({ cwd, providerId }) => {
        const availability = await window.api.provider!.checkAvailability!({ providerId });
        const raw = await window.api.provider!.streamTurn!({
          providerId,
          turnId: `native-smoke-${providerId}`,
          cwd,
          prompt: "Reply with exactly STAVE_SMOKE_OK. Do not call tools.",
          runtimeOptions: providerId === "claude-code"
            ? {
                claudePermissionMode: "dontAsk",
                claudeMaxTurns: 1,
                providerTimeoutMs: 45_000,
              }
            : {
                codexFileAccess: "read-only",
                codexNetworkAccess: false,
                codexApprovalPolicy: "never",
                providerTimeoutMs: 45_000,
              },
        });
        const events = Array.isArray(raw) ? raw : [];
        const text = events
          .filter((event): event is { type: string; text: string } =>
            typeof event === "object" && event !== null &&
            "type" in event && event.type === "text" &&
            "text" in event && typeof event.text === "string")
          .map((event) => event.text)
          .join("");
        const classifyError = (value: unknown) => {
          const message = String(value ?? "").toLowerCase();
          if (/rate.?limit|429|too many requests/.test(message)) return "rate-limit";
          if (/quota|credit|billing|usage.?limit/.test(message)) return "quota";
          if (/auth|login|unauthorized|401|forbidden|403/.test(message)) return "auth";
          if (/model.*(unavailable|not found|unsupported)|unsupported model/.test(message)) return "model";
          if (/network|fetch|connect|dns|econn/.test(message)) return "network";
          if (/timed? out|timeout/.test(message)) return "timeout";
          if (/overload|503|500|server error/.test(message)) return "service";
          return "unclassified";
        };
        return {
          available: availability.available,
          eventTypes: events.map((event) =>
            typeof event === "object" && event !== null && "type" in event
              ? String(event.type)
              : "unknown"),
          answeredExactly: text.trim() === "STAVE_SMOKE_OK",
          answerLength: text.trim().length,
          hasMarker: text.includes("STAVE_SMOKE_OK"),
          answerCategory: classifyError(text),
          textSegments: events.filter((event) =>
            typeof event === "object" && event !== null &&
            "type" in event && event.type === "text")
            .map((event) => ({
              length: String((event as { text?: unknown }).text ?? "").length,
              segmentIdPresent: "segmentId" in event,
            })),
          errorKinds: events.filter((event) =>
            typeof event === "object" && event !== null &&
            "type" in event && event.type === "error")
            .map((event) => ({
              recoverable: "recoverable" in event ? event.recoverable : null,
              code: "code" in event ? event.code : null,
              category: classifyError("message" in event ? event.message : null),
            })),
        };
      }, { cwd: projectPath, providerId });
      console.log(`${providerId} live smoke: ${JSON.stringify(result)}`);
      expect(result.available).toBe(true);
      expect(result.eventTypes).toContain("usage");
      expect(result.eventTypes).toContain("done");
      expect(result.answeredExactly).toBe(true);
    } finally {
      await stave.close();
      await rm(projectPath, { recursive: true, force: true });
    }
  });
}

test("live Codex cancellation, retry, and session resume survive an Electron restart", async () => {
  test.setTimeout(150_000);
  const projectPath = await mkdtemp(path.join(tmpdir(), "stave-provider-resume-"));
  const userDataDir = await mkdtemp(path.join(tmpdir(), "stave-provider-profile-"));
  let stave: StaveApp | null = null;
  try {
    stave = await launchStave({ userDataDir });
    const cancelled = await stave.page.evaluate(async (cwd) => {
      const turnId = "native-cancel-turn";
      const started = await window.api.provider!.startPushTurn!({
        providerId: "codex",
        turnId,
        cwd,
        prompt: "Think silently for several seconds, then reply STAVE_CANCEL_IF_NOT_STOPPED. Do not call tools.",
        runtimeOptions: {
          codexFileAccess: "read-only",
          codexNetworkAccess: false,
          codexApprovalPolicy: "never",
          providerTimeoutMs: 45_000,
        },
      });
      if (!started.ok) return { started: false, aborted: false, stopReason: null, sawSession: false, sessionId: null };
      let cursor = 0;
      let sawSession = false;
      let sessionId: string | null = null;
      let done = false;
      let sawProviderTurnBeforeAbort = false;
      let sawTextBeforeAbort = false;
      let sawDoneBeforeAbort = false;
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline && !sawSession && !done) {
        const batch = await window.api.provider!.readStreamTurn!({ streamId: started.streamId, cursor });
        cursor = batch.cursor;
        sawProviderTurnBeforeAbort ||= batch.events.some((event) => event.type === "provider_turn");
        sawTextBeforeAbort ||= batch.events.some((event) => event.type === "text");
        sawDoneBeforeAbort ||= batch.events.some((event) => event.type === "done");
        sawSession = batch.events.some((event) =>
          typeof event === "object" && event !== null &&
          "type" in event && event.type === "provider_session");
        const sessionEvent = batch.events.find((event) =>
          typeof event === "object" && event !== null &&
          "type" in event && event.type === "provider_session") as
          | { nativeSessionId?: string }
          | undefined;
        sessionId = sessionEvent?.nativeSessionId ?? sessionId;
        done = batch.done;
        if (!sawSession && !done) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const abort = await window.api.provider!.abortTurn!({ turnId });
      let stopReason: string | null = null;
      const finishBy = Date.now() + 20_000;
      while (Date.now() < finishBy) {
        const batch = await window.api.provider!.readStreamTurn!({ streamId: started.streamId, cursor });
        cursor = batch.cursor;
        for (const event of batch.events) {
          if (typeof event === "object" && event !== null &&
            "type" in event && event.type === "done" &&
            "stop_reason" in event && typeof event.stop_reason === "string") {
            stopReason = event.stop_reason;
          }
        }
        if (batch.done) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return { started: started.ok, aborted: abort.ok, stopReason, sawSession, sessionId,
        sawProviderTurnBeforeAbort, sawTextBeforeAbort, sawDoneBeforeAbort };
    }, projectPath);
    console.log(`codex cancel smoke: ${JSON.stringify({
      started: cancelled.started,
      aborted: cancelled.aborted,
      stopReason: cancelled.stopReason,
      sawSession: cancelled.sawSession,
      sawProviderTurnBeforeAbort: cancelled.sawProviderTurnBeforeAbort,
      sawTextBeforeAbort: cancelled.sawTextBeforeAbort,
      sawDoneBeforeAbort: cancelled.sawDoneBeforeAbort,
    })}`);
    expect(cancelled).toMatchObject({
      started: true,
      aborted: true,
      stopReason: "user_abort",
      sawSession: true,
    });

    const first = await stave.page.evaluate(async (cwd) => {
      const raw = await window.api.provider!.streamTurn!({
        providerId: "codex",
        turnId: "native-retry-turn",
        cwd,
        prompt: "The previous request was canceled. Ignore it; for this new turn reply with exactly STAVE_RETRY_OK. Do not call tools.",
        runtimeOptions: {
          codexFileAccess: "read-only",
          codexNetworkAccess: false,
          codexApprovalPolicy: "never",
          providerTimeoutMs: 45_000,
        },
      });
      const events = Array.isArray(raw) ? raw : [];
      const session = events.find((event) =>
        typeof event === "object" && event !== null &&
        "type" in event && event.type === "provider_session") as
        | { nativeSessionId: string }
        | undefined;
      const answer = events.filter((event) =>
        typeof event === "object" && event !== null &&
        "type" in event && event.type === "text")
        .map((event) => (event as { text: string }).text)
        .join("");
      const textEvents = events.filter((event) => event.type === "text") as Array<{
        text: string; segmentId?: string;
      }>;
      return {
        sessionId: session?.nativeSessionId ?? null,
        answeredExactly: answer.trim() === "STAVE_RETRY_OK",
        answerLength: answer.trim().length,
        markerCount: answer.split("STAVE_RETRY_OK").length - 1,
        hasCancelledMarker: answer.includes("STAVE_CANCEL_IF_NOT_STOPPED"),
        cancelledMarkerAt: answer.indexOf("STAVE_CANCEL_IF_NOT_STOPPED"),
        retryMarkerAt: answer.indexOf("STAVE_RETRY_OK"),
        textLengths: textEvents.map((event) => event.text.length),
        distinctSegments: new Set(textEvents.map((event) => event.segmentId)).size,
        eventTypes: events.map((event) => event.type),
        usage: events.some((event) =>
          typeof event === "object" && event !== null &&
          "type" in event && event.type === "usage"),
        done: events.some((event) =>
          typeof event === "object" && event !== null &&
          "type" in event && event.type === "done"),
      };
    }, projectPath);
    console.log(`codex retry smoke: ${JSON.stringify({
      answeredExactly: first.answeredExactly,
      answerLength: first.answerLength,
      markerCount: first.markerCount,
      hasCancelledMarker: first.hasCancelledMarker,
      cancelledMarkerAt: first.cancelledMarkerAt,
      retryMarkerAt: first.retryMarkerAt,
      textLengths: first.textLengths,
      distinctSegments: first.distinctSegments,
      eventTypes: first.eventTypes,
      usage: first.usage,
      done: first.done,
      hasSession: Boolean(first.sessionId),
      sameSessionAsCanceled: first.sessionId === cancelled.sessionId,
    })}`);
    expect(first.answeredExactly).toBe(true);
    expect(first.usage).toBe(true);
    expect(first.done).toBe(true);
    expect(first.sessionId).toBeTruthy();

    await stave.close();
    stave = null;
    stave = await launchStave({ userDataDir });
    const resumed = await stave.page.evaluate(async ({ cwd, sessionId }) => {
      const raw = await window.api.provider!.streamTurn!({
        providerId: "codex",
        turnId: "native-resume-turn",
        cwd,
        prompt: "Reply with exactly STAVE_RESUME_OK. Do not call tools.",
        runtimeOptions: {
          codexResumeThreadId: sessionId,
          codexFileAccess: "read-only",
          codexNetworkAccess: false,
          codexApprovalPolicy: "never",
          providerTimeoutMs: 45_000,
        },
      });
      const events = Array.isArray(raw) ? raw : [];
      const session = events.find((event) =>
        typeof event === "object" && event !== null &&
        "type" in event && event.type === "provider_session") as
        | { nativeSessionId: string }
        | undefined;
      const answer = events.filter((event) =>
        typeof event === "object" && event !== null &&
        "type" in event && event.type === "text")
        .map((event) => (event as { text: string }).text)
        .join("");
      return {
        sessionId: session?.nativeSessionId ?? null,
        answeredExactly: answer.trim() === "STAVE_RESUME_OK",
        usage: events.some((event) =>
          typeof event === "object" && event !== null &&
          "type" in event && event.type === "usage"),
        done: events.some((event) =>
          typeof event === "object" && event !== null &&
          "type" in event && event.type === "done"),
      };
    }, { cwd: projectPath, sessionId: first.sessionId! });
    console.log(`codex resume smoke: ${JSON.stringify({
      answeredExactly: resumed.answeredExactly,
      usage: resumed.usage,
      done: resumed.done,
      sameSession: resumed.sessionId === first.sessionId,
    })}`);
    expect(resumed.answeredExactly).toBe(true);
    expect(resumed.usage).toBe(true);
    expect(resumed.done).toBe(true);
    expect(resumed.sessionId).toBe(first.sessionId);
  } finally {
    await stave?.close();
    await rm(projectPath, { recursive: true, force: true });
    await rm(userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
});
