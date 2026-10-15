import { describe, expect, test } from "bun:test";
import { parseWorkspaceSnapshot } from "@/lib/task-context/schemas";

function snapshotWith(queuedTurn: Record<string, unknown>, runtimeOverrides?: Record<string, unknown>) {
  return parseWorkspaceSnapshot({ payload: {
    activeTaskId: "t",
    tasks: [{ id: "t", title: "Task", provider: "codex", updatedAt: "now", unread: false }],
    messagesByTask: { t: [] },
    promptDraftByTask: { t: { text: "", attachedFilePaths: [], attachments: [],
      ...(runtimeOverrides ? { runtimeOverrides } : {}), queuedTurns: [queuedTurn] } },
  } });
}

// Registered as `agent-run-adaptive-draft-key` in config/temporary-migrations.json.
describe("a draft saved while the composer had Auto adjust", () => {
  test("a queued turn that carries the retired key still parses, without it", () => {
    const parsed = snapshotWith({ id: "q", content: "Work", queuedAt: "now", attachedFilePaths: [], attachments: [], agentRunAdaptive: true });
    expect(parsed).not.toBeNull();
    const queued = parsed?.promptDraftByTask.t?.queuedTurns?.[0];
    expect(queued?.content).toBe("Work");
    expect(queued && "agentRunAdaptive" in queued).toBe(false);
  });

  test("the draft's own overrides drop the retired key and keep the rest", () => {
    const parsed = snapshotWith({ id: "q", content: "Work", queuedAt: "now", attachedFilePaths: [], attachments: [] },
      { agentRunAdaptive: true, codexFastMode: true });
    expect(parsed?.promptDraftByTask.t?.runtimeOverrides).toEqual({ codexFastMode: true });
  });

  test("any other unknown key still rejects the queued turn's strict schema", () => {
    expect(snapshotWith({ id: "q", content: "Work", queuedAt: "now", attachedFilePaths: [], attachments: [], unknownKey: 1 })).toBeNull();
  });
});
