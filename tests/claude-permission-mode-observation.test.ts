import { describe, expect, test } from "bun:test";
import { createClaudeAutoModeNotice } from "../electron/providers/claude-auto-mode";
import { mapClaudeMessageToEvents } from "../electron/providers/claude-event-mapping";

function mapStatus(
  notice: ReturnType<typeof createClaudeAutoModeNotice>,
  permissionMode: unknown,
  status: string | null = null,
  sessionId = "session-1",
) {
  return mapClaudeMessageToEvents({
    message: {
      type: "system", subtype: "status", status, permissionMode,
      session_id: sessionId, uuid: "status-message",
    } as never,
    claudeDebugStream: false,
    permissionModeNotice: notice,
  });
}

describe("Claude effective permission mode observation", () => {
  test("reports an actual Auto fallback once and preserves compaction", () => {
    const notice = createClaudeAutoModeNotice();
    notice.observeInit({ permissionMode: "auto", session_id: "session-1" });
    expect(mapStatus(notice, "default", "compacting")).toEqual([
      { type: "system", content: "Compacting conversation context…" },
      { type: "system", content: "Claude permission mode changed from auto to default." },
    ]);
    expect(mapStatus(notice, "default")).toEqual([]);
    expect(notice.take()).toBeNull();
  });

  test("reports a return to Auto without suppressing request status", () => {
    const notice = createClaudeAutoModeNotice();
    notice.observeInit({ permissionMode: "default", session_id: "session-1" });
    expect(mapStatus(notice, "auto", "requesting")).toEqual([
      { type: "system", content: "Sending request to model…" },
      { type: "system", content: "Claude permission mode changed from default to auto." },
    ]);
    expect(mapStatus(notice, "auto")).toEqual([]);
  });

  test("treats init and the first known status as baselines without an extra notice", () => {
    const initialized = createClaudeAutoModeNotice();
    initialized.observeInit({ permissionMode: "auto", session_id: "session-1" });
    expect(mapStatus(initialized, "auto")).toEqual([]);
    const statusOnly = createClaudeAutoModeNotice();
    expect(mapStatus(statusOnly, "default")).toEqual([]);
    expect(mapStatus(statusOnly, "auto")).toEqual([
      { type: "system", content: "Claude permission mode changed from default to auto." },
    ]);
  });

  test("ignores unknown and missing modes without losing the last known mode", () => {
    const notice = createClaudeAutoModeNotice();
    notice.observeInit({ permissionMode: "auto", session_id: "session-1" });
    for (const mode of [undefined, null, "", "futureMode", { mode: "default" }]) {
      expect(mapStatus(notice, mode)).toEqual([]);
    }
    expect(mapStatus(notice, undefined, "compacting")).toEqual([
      { type: "system", content: "Compacting conversation context…" },
    ]);
    expect(mapStatus(notice, "default")).toEqual([
      { type: "system", content: "Claude permission mode changed from auto to default." },
    ]);
  });

  test("does not repeat the init fallback notice after observing the same mode", () => {
    const notice = createClaudeAutoModeNotice();
    notice.observeInit({ permissionMode: "default", session_id: "session-1" });
    expect(notice.take()).toBe("Auto isn't available right now; Claude will ask before actions.");
    expect(mapStatus(notice, "default")).toEqual([]);
    expect(notice.take()).toBeNull();
    expect(mapStatus(notice, "auto")).toHaveLength(1);
    expect(mapStatus(notice, "default")).toHaveLength(1);
    expect(notice.take()).toBeNull();
  });

  test("does not let a late init model lookup override an effective status", async () => {
    let resolveModels!: (value: { models: Array<{ value: string; supportsAutoMode?: boolean }> }) => void;
    const models = new Promise<{ models: Array<{ value: string; supportsAutoMode?: boolean }> }>((resolve) => { resolveModels = resolve; });
    const notice = createClaudeAutoModeNotice();
    notice.observeInit({ permissionMode: "auto", model: "session-model", session_id: "session-1" }, { initializationResult: () => models });
    expect(mapStatus(notice, "default")).toHaveLength(1);
    expect(mapStatus(notice, "auto")).toHaveLength(1);
    resolveModels({ models: [{ value: "session-model" }, { value: "another-model", supportsAutoMode: true }] });
    await models;
    expect(notice.take()).toBeNull();
  });

  test("retains model fallback detection when no effective status supersedes it", async () => {
    const models = Promise.resolve({ models: [{ value: "session-model" }, { value: "another-model", supportsAutoMode: true }] });
    const notice = createClaudeAutoModeNotice();
    notice.observeInit({ permissionMode: "auto", model: "session-model", session_id: "session-1" }, { initializationResult: () => models });
    await models;
    expect(notice.take()).toBe("Auto isn't available for this model; Claude will ask before actions.");
    expect(notice.take()).toBeNull();
  });

  test("ignores another session and establishes a fresh baseline after recovery", () => {
    const notice = createClaudeAutoModeNotice();
    notice.observeInit({ permissionMode: "auto", session_id: "session-1" });
    expect(mapStatus(notice, "default", null, "older-session")).toEqual([]);
    expect(mapStatus(notice, "default")).toHaveLength(1);
    notice.observeInit({ permissionMode: "auto", session_id: "session-2" });
    expect(mapStatus(notice, "default", null, "session-1")).toEqual([]);
    expect(mapStatus(notice, "auto", null, "session-2")).toEqual([]);
    expect(mapStatus(notice, "default", null, "session-2")).toHaveLength(1);
  });

  test("observes every native mode while leaving requested settings untouched", () => {
    const init = { permissionMode: "default", session_id: "session-1" };
    const notice = createClaudeAutoModeNotice();
    notice.observeInit(init);
    let previous = "default";
    for (const mode of ["acceptEdits", "plan", "bypassPermissions", "dontAsk", "auto"]) {
      expect(mapStatus(notice, mode)).toEqual([
        { type: "system", content: `Claude permission mode changed from ${previous} to ${mode}.` },
      ]);
      previous = mode;
    }
    expect(init.permissionMode).toBe("default");
    expect(notice.take()).toBeNull();
  });
});
