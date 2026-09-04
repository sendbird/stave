import { describe, expect, test } from "bun:test";
import {
  buildEntryStateFromStatus,
  buildScriptRunFailureState,
  countRunningServiceEntries,
  formatScriptDuration,
  reduceScriptUiState,
  scriptEntryKey,
  type ScriptUiState,
} from "../src/lib/workspace-scripts/runtime-state";
import type {
  WorkspaceScriptEventEnvelope,
  WorkspaceScriptStatusEntry,
} from "../src/lib/workspace-scripts/types";

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

describe("scriptEntryKey", () => {
  test("builds a canonical kind:id key", () => {
    expect(scriptEntryKey("service", "dev")).toBe("service:dev");
    expect(scriptEntryKey("action", "lint")).toBe("action:lint");
  });
});

describe("countRunningServiceEntries", () => {
  test("counts only running process entries", () => {
    expect(
      countRunningServiceEntries({
        "service:dev": { running: true, log: "" },
        "service:storybook": { running: false, log: "" },
        "action:lint": { running: true, log: "" },
      }),
    ).toBe(1);
  });

  test("returns 0 for an empty snapshot", () => {
    expect(countRunningServiceEntries({})).toBe(0);
  });
});

describe("reduceScriptUiState", () => {
  test("marks non-zero completion as an inline error and records exit code", () => {
    const state = reduceScriptUiState(
      { running: true, log: "booting\n" },
      createEnvelope({ type: "completed", exitCode: 2 }),
      1_000,
    );

    expect(state).toMatchObject({
      running: false,
      log: "booting\n",
      error: "Exited with code 2.",
      exitCode: 2,
      endedAt: 1_000,
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
    expect(state.exitCode).toBe(0);
  });

  test("clears prior log, orbit URL, and end state when a new run starts", () => {
    const state = reduceScriptUiState(
      {
        running: false,
        runId: "run-0",
        log: "old log",
        orbitUrl: "https://old.example.com",
        error: "previous failure",
        endedAt: 500,
        exitCode: 1,
      },
      createEnvelope({
        type: "started",
        commandIndex: 0,
        command: "bun run dev",
        totalCommands: 3,
      }),
      2_000,
    );

    expect(state).toMatchObject({
      running: true,
      runId: "run-1",
      log: "",
      orbitUrl: undefined,
      error: undefined,
      startedAt: 2_000,
      endedAt: undefined,
      exitCode: undefined,
      totalCommands: 3,
    });
  });

  test("advances command index on command-completed", () => {
    const started = reduceScriptUiState(
      undefined,
      createEnvelope({
        type: "started",
        commandIndex: 0,
        command: "a",
        totalCommands: 2,
      }),
    );
    const advanced = reduceScriptUiState(
      started,
      createEnvelope({
        type: "command-completed",
        commandIndex: 1,
        exitCode: 0,
      }),
    );
    expect(advanced.commandIndex).toBe(1);
  });

  test("records endedAt on stop and error", () => {
    const stopped = reduceScriptUiState(
      { running: true, log: "" },
      createEnvelope({ type: "stopped" }),
      3_000,
    );
    expect(stopped).toMatchObject({ running: false, endedAt: 3_000 });

    const errored = reduceScriptUiState(
      { running: true, log: "" },
      createEnvelope({ type: "error", error: "boom" }),
      4_000,
    );
    expect(errored).toMatchObject({
      running: false,
      error: "boom",
      endedAt: 4_000,
    });
  });
});

describe("buildScriptRunFailureState", () => {
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

describe("buildEntryStateFromStatus", () => {
  test("maps a hook-sourced status entry with its source label", () => {
    const status: WorkspaceScriptStatusEntry = {
      scriptId: "dev",
      scriptKind: "service",
      running: true,
      log: "hi",
      runId: "run-9",
      sessionId: "s-9",
      source: { kind: "hook", trigger: "turn.completed" },
    };
    const state = buildEntryStateFromStatus(status);
    expect(state).toMatchObject({
      running: true,
      log: "hi",
      runId: "run-9",
      sessionId: "s-9",
      sourceLabel: "Hook · Turn Completed",
    });
  });
});

describe("formatScriptDuration", () => {
  test("formats sub-second, seconds, and minutes", () => {
    expect(formatScriptDuration(250)).toBe("250ms");
    expect(formatScriptDuration(4_200)).toBe("4.2s");
    expect(formatScriptDuration(12_000)).toBe("12s");
    expect(formatScriptDuration(65_000)).toBe("1m 5s");
    expect(formatScriptDuration(120_000)).toBe("2m");
  });

  test("returns empty for invalid durations", () => {
    expect(formatScriptDuration(-1)).toBe("");
    expect(formatScriptDuration(Number.NaN)).toBe("");
  });
});
