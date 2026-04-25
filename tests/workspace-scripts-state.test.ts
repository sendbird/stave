import { afterEach, describe, expect, test } from "bun:test";
import {
  clearWorkspaceScriptProcesses,
  deleteWorkspaceScriptProcess,
  getWorkspaceScriptStatusesForWorkspace,
  recordWorkspaceScriptEvent,
  setWorkspaceScriptProcess,
} from "../electron/main/workspace-scripts/state";

afterEach(() => {
  clearWorkspaceScriptProcesses();
});

describe("workspace script runtime snapshots", () => {
  test("hydrates running service status with log, orbit URL, and last error", () => {
    setWorkspaceScriptProcess("ws-1:service:dev", {
      workspaceId: "ws-1",
      scriptId: "dev",
      scriptKind: "service",
      runId: "run-1",
      source: { kind: "manual" },
      process: null,
      aborted: false,
      sessionId: "session-1",
      log: "",
    });

    recordWorkspaceScriptEvent({
      workspaceId: "ws-1",
      scriptId: "dev",
      scriptKind: "service",
      runId: "run-1",
      event: { type: "output", data: "ready\n" },
    });
    recordWorkspaceScriptEvent({
      workspaceId: "ws-1",
      scriptId: "dev",
      scriptKind: "service",
      runId: "run-1",
      event: { type: "orbit-url", url: "https://dev.stave.localhost" },
    });
    recordWorkspaceScriptEvent({
      workspaceId: "ws-1",
      scriptId: "dev",
      scriptKind: "service",
      runId: "run-1",
      event: { type: "error", error: "port already in use" },
    });

    expect(getWorkspaceScriptStatusesForWorkspace("ws-1")).toEqual([
      {
        scriptId: "dev",
        scriptKind: "service",
        running: true,
        log: "ready\n",
        runId: "run-1",
        sessionId: "session-1",
        error: "port already in use",
        orbitUrl: "https://dev.stave.localhost",
        source: { kind: "manual" },
      },
    ]);
  });

  test("ignores stale events from an older run id", () => {
    setWorkspaceScriptProcess("ws-1:service:dev", {
      workspaceId: "ws-1",
      scriptId: "dev",
      scriptKind: "service",
      runId: "run-2",
      source: { kind: "manual" },
      process: null,
      aborted: false,
      log: "",
    });

    recordWorkspaceScriptEvent({
      workspaceId: "ws-1",
      scriptId: "dev",
      scriptKind: "service",
      runId: "run-1",
      event: { type: "output", data: "stale\n" },
    });

    expect(getWorkspaceScriptStatusesForWorkspace("ws-1")[0]?.log).toBe("");
  });

  test("disposes process cleanup handlers when deleting an entry", () => {
    let cleanupCalls = 0;

    setWorkspaceScriptProcess("ws-1:service:dev", {
      workspaceId: "ws-1",
      scriptId: "dev",
      scriptKind: "service",
      runId: "run-1",
      source: { kind: "manual" },
      process: null,
      aborted: false,
      log: "",
      cleanup: () => {
        cleanupCalls += 1;
      },
    });

    deleteWorkspaceScriptProcess("ws-1:service:dev");
    deleteWorkspaceScriptProcess("ws-1:service:dev");

    expect(cleanupCalls).toBe(1);
  });
});
