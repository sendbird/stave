import { describe, expect, test } from "bun:test";
import {
  buildScriptRunFailureState,
  reduceScriptUiState,
  type ScriptUiState,
} from "../src/components/layout/workspace-scripts-panel.utils";
import type { WorkspaceScriptEventEnvelope } from "../src/lib/workspace-scripts/types";

function createEnvelope(
  event: WorkspaceScriptEventEnvelope["event"],
  runId = "run-1",
): WorkspaceScriptEventEnvelope {
  return {
    workspaceId: "ws-1",
    scriptId: "dev",
    scriptKind: "service",
    runId,
    sessionId: "session-1",
    source: { kind: "manual" },
    event,
  };
}

describe("workspace scripts panel state", () => {
  test("marks non-zero completion as an inline error", () => {
    const state = reduceScriptUiState(
      { running: true, log: "booting\n" },
      createEnvelope({ type: "completed", exitCode: 2 }),
    );

    expect(state).toMatchObject({
      running: false,
      log: "booting\n",
      error: "Exited with code 2.",
    });
  });

  test("clears prior log and orbit URL when a new run starts", () => {
    const state = reduceScriptUiState(
      {
        running: false,
        runId: "run-0",
        log: "old log",
        orbitUrl: "https://old.example.com",
        error: "previous failure",
      },
      createEnvelope({ type: "started", commandIndex: 0, command: "bun run dev", totalCommands: 1 }),
    );

    expect(state).toMatchObject({
      running: true,
      runId: "run-1",
      log: "",
      orbitUrl: undefined,
      error: undefined,
    });
  });

  test("does not set error for zero exit code", () => {
    const state = reduceScriptUiState(
      { running: true, log: "ok\n" },
      createEnvelope({ type: "completed", exitCode: 0 }),
    );

    expect(state.running).toBe(false);
    expect(state.log).toBe("ok\n");
    expect(state.error).toBeUndefined();
  });

  test("keeps the last log but surfaces start failures inline", () => {
    const state = buildScriptRunFailureState({
      existing: {
        running: false,
        log: "last output\n",
        orbitUrl: "https://old.example.com",
      } satisfies ScriptUiState,
      error: "entry is not defined",
    });

    expect(state).toEqual({
      running: false,
      runId: undefined,
      sessionId: undefined,
      log: "last output\n",
      error: "entry is not defined",
      orbitUrl: undefined,
      sourceLabel: "Manual",
    });
  });
});
