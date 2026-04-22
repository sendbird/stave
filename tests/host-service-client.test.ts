import { describe, expect, test } from "bun:test";
import {
  measureSerializedHostServiceRequestBytes,
  resolveHostServiceScriptPath,
} from "../electron/main/host-service-client";
import { HOST_SERVICE_PROTOCOL_MESSAGE_MAX_BYTES } from "../electron/shared/host-service-transport";

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
});
