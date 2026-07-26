import { describe, expect, test } from "bun:test";
import {
  measureSerializedHostServiceRequestBytes,
  resolveHostServiceScriptPath,
} from "../electron/main/host-service-client";
import {
  HOST_SERVICE_DEFAULT_REQUEST_TIMEOUT_MS,
  resolveHostServiceRequestTimeoutMs,
} from "../electron/main/host-service-request-timeouts";
import { HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES } from "../electron/shared/host-service-transport";

describe("resolveHostServiceRequestTimeoutMs", () => {
  test("applies a backstop so a dropped response cannot hang a caller forever", () => {
    expect(resolveHostServiceRequestTimeoutMs({ method: "scm.status" })).toBe(
      HOST_SERVICE_DEFAULT_REQUEST_TIMEOUT_MS,
    );
    expect(
      resolveHostServiceRequestTimeoutMs({ method: "local-mcp.invoke" }),
    ).toBe(HOST_SERVICE_DEFAULT_REQUEST_TIMEOUT_MS);
  });

  test("exempts turns and long-lived runs that have no meaningful deadline", () => {
    expect(
      resolveHostServiceRequestTimeoutMs({ method: "provider.stream-turn" }),
    ).toBeNull();
    expect(
      resolveHostServiceRequestTimeoutMs({ method: "runs.execute-secondary" }),
    ).toBeNull();
    expect(
      resolveHostServiceRequestTimeoutMs({ method: "workspace-scripts.run-entry" }),
    ).toBeNull();
  });

  test("bounds shutdown so a wedged cleanup cannot block quit", () => {
    expect(
      resolveHostServiceRequestTimeoutMs({ method: "service.shutdown" }),
    ).toBe(30_000);
  });

  test("lets a caller override the backstop per request", () => {
    expect(
      resolveHostServiceRequestTimeoutMs({
        method: "local-mcp.invoke",
        override: null,
      }),
    ).toBeNull();
    expect(
      resolveHostServiceRequestTimeoutMs({
        method: "scm.status",
        override: 1_500,
      }),
    ).toBe(1_500);
  });
});

describe("resolveHostServiceScriptPath", () => {
  test("uses the sibling file when the bundled main entry owns the client", () => {
    expect(
      resolveHostServiceScriptPath({
        moduleUrl: "file:///tmp/stave/out/main/index.js",
        pathExists: (candidate) => candidate === "/tmp/stave/out/main/host-service.js",
      }),
    ).toBe("/tmp/stave/out/main/host-service.js");
  });

  test("falls back to the parent directory when the client lives in a chunk", () => {
    expect(
      resolveHostServiceScriptPath({
        moduleUrl: "file:///tmp/stave/out/main/chunks/index-ABCD.js",
        pathExists: (candidate) => candidate === "/tmp/stave/out/main/host-service.js",
      }),
    ).toBe("/tmp/stave/out/main/host-service.js");
  });

  test("measures oversized request payloads before writing to host-service stdin", () => {
    const bytes = measureSerializedHostServiceRequestBytes({
      method: "provider.start-push-turn",
      params: {
        providerId: "codex",
        prompt: "continue",
        conversation: undefined,
        taskId: "task-1",
        workspaceId: "ws-1",
        cwd: "/tmp/project",
        runtimeOptions: undefined,
        turnId: "turn-1",
      },
    });

    expect(bytes).toBeGreaterThan(0);
    expect(
      measureSerializedHostServiceRequestBytes({
        method: "provider.start-push-turn",
        params: {
          providerId: "codex",
          prompt: "x".repeat(HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES),
          conversation: undefined,
          taskId: "task-1",
          workspaceId: "ws-1",
          cwd: "/tmp/project",
          runtimeOptions: undefined,
          turnId: "turn-1",
        },
      }),
    ).toBeGreaterThan(HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES);
  });

  test("serializes the bounded secondary execution contract", () => {
    const bytes = measureSerializedHostServiceRequestBytes({
      method: "runs.execute-secondary",
      params: {
        runId: "run-1",
        stepId: "step-1",
        executionId: "execution-1",
        input: {
          providerId: "codex",
          model: "gpt-test",
          prompt: "Inspect locally.",
          cwd: "/tmp/project",
          runtimeHints: {},
        },
        policy: {
          maxAttempts: 2,
          timeoutMs: 30_000,
          maxTurns: 4,
          maxOutputBytes: 16_384,
          maxEvents: 64,
        },
      },
    });

    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES);
  });
});
