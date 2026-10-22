import { afterAll, describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Database } from "bun:sqlite";
import { SqliteStore } from "../electron/persistence/sqlite-store";
import { TaskHandoffStore } from "../electron/persistence/task-handoff-store";
import { taskHandoffPreload } from "../electron/persistence/task-handoff-preload";
import { findHandoffProposal, TaskHandoffEditor } from "@/components/session/TaskHandoffPanel";
import { buildCanonicalConversationRequest } from "@/lib/providers/canonical-request";
import { buildProviderTurnPrompt } from "@/lib/providers/provider-request-translators";
import {
  applyHandoffDraft,
  buildHandoffRecordContextPart,
  buildHandoffSuggestions,
  buildHandoffUpdateRequest,
  emptyHandoffRecord,
  HANDOFF_PROPOSAL_FENCE,
  mergeHandoffSuggestions,
  parseHandoffProposal,
  resolveHandoffCommit,
  type HandoffDraft,
  type TaskHandoffRecord,
} from "@/lib/task-context/handoff-record";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ChatMessage } from "@/types/chat";

const EMPTY_DRAFT: HandoffDraft = { goal: "", decisions: "", verified: "", remaining: "", cautions: "" };
const AT = "2026-10-22T10:00:00.000Z";

function harness(db = new Database(":memory:")) {
  const store = Object.create(SqliteStore.prototype) as SqliteStore;
  Object.assign(store, { db, _closed: false });
  (store as unknown as { bootstrap: () => void }).bootstrap();
  Object.assign(store, {
    taskHandoffs: new TaskHandoffStore(db as never),
    // Removing a task also clears its Lens review records; none exist here.
    lensReviewRecords: { deleteTask: async () => {}, deleteWorkspace: async () => {} },
  });
  db.run("INSERT INTO tasks (id, workspace_id, title, provider, updated_at) VALUES ('ws:task', 'ws', 'Task', 'claude-code', ?)", [AT]);
  db.run("INSERT INTO tasks (id, workspace_id, title, provider, updated_at) VALUES ('ws:other', 'ws', 'Other', 'codex', ?)", [AT]);
  return { db, store };
}

const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
mock.module("electron", () => ({
  ipcMain: { handle: (channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => handlers.set(channel, handler) },
}));
const ipcHarness = harness();
mock.module("../electron/main/state", () => ({ ensurePersistenceReady: async () => ipcHarness.store }));
const { registerTaskHandoffHandlers } = await import("../electron/main/ipc/task-handoff");
registerTaskHandoffHandlers();
const bridge = taskHandoffPreload(async (channel, input) => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error("Missing handler");
  return JSON.parse(JSON.stringify(await handler({}, JSON.parse(JSON.stringify(input)))));
});
afterAll(() => {
  ipcHarness.db.close();
  mock.restore();
});

describe("handoff record rules", () => {
  test("a save stamps only the sections it changed, with their author, and drops emptied ones", () => {
    const first = applyHandoffDraft({
      record: emptyHandoffRecord(),
      draft: { ...EMPTY_DRAFT, goal: "Ship search", decisions: "- Keep the public API stable" },
      authors: { decisions: "agent" },
      at: AT,
    });
    expect(first).toMatchObject({
      revision: 1,
      sections: {
        goal: { text: "Ship search", updatedBy: "user", updatedAt: AT },
        decisions: { text: "- Keep the public API stable", updatedBy: "agent" },
      },
    });
    const second = applyHandoffDraft({
      record: first,
      draft: { ...EMPTY_DRAFT, goal: "Ship search", remaining: "- Docs" },
      at: "2026-10-22T11:00:00.000Z",
    });
    expect(second.revision).toBe(2);
    expect(second.sections.goal).toEqual(first.sections.goal);
    expect(second.sections.decisions).toBeUndefined();
    expect(applyHandoffDraft({ record: second, draft: { ...EMPTY_DRAFT, goal: "Ship search", remaining: "- Docs" }, at: AT })).toBe(second);
  });

  test("Save on the Notes contract: unchanged, conflict when the record moved, else save", () => {
    const record = applyHandoffDraft({ record: emptyHandoffRecord(), draft: { ...EMPTY_DRAFT, goal: "A" }, at: AT });
    expect(resolveHandoffCommit({ draft: { ...EMPTY_DRAFT, goal: " A " }, baseRevision: 0, current: record })).toBe("unchanged");
    expect(resolveHandoffCommit({ draft: { ...EMPTY_DRAFT, goal: "B" }, baseRevision: 0, current: record })).toBe("conflict");
    expect(resolveHandoffCommit({ draft: { ...EMPTY_DRAFT, goal: "B" }, baseRevision: 1, current: record })).toBe("save");
  });

  test("Stave's facts become lines the draft does not already have", () => {
    const suggestions = buildHandoffSuggestions(
      {
        checks: { status: "fail", passed: 0, total: 2, failures: [{ scriptId: "test", message: "2 failed", blocking: true }] },
        approvals: [{ tool: "Run command", description: "bun run migrate" }],
        planFilePaths: [".stave/context/plans/abc_2026.md"],
      },
      {
        checksPassed: (passed, total) => `passed ${passed}/${total}`,
        checksFailed: (failures) => `failed ${failures}`,
        approval: (tool, description) => `approved ${tool}: ${description}`,
        plan: (path) => `plan ${path}`,
      },
    );
    expect(suggestions).toEqual({
      cautions: "- failed test: 2 failed",
      decisions: "- approved Run command: bun run migrate",
      remaining: "- plan .stave/context/plans/abc_2026.md",
    });
    const merged = mergeHandoffSuggestions({ ...EMPTY_DRAFT, decisions: "- approved Run command: bun run migrate" }, suggestions);
    expect(merged.changed).toEqual(["remaining", "cautions"]);
    expect(merged.draft.decisions).toBe("- approved Run command: bun run migrate");
  });

  test("an agent's proposal is read from its last fenced block; anything else is ignored", () => {
    const reply = [
      "Here is my proposal.",
      "```" + HANDOFF_PROPOSAL_FENCE + "\n" + JSON.stringify({ goal: "old" }) + "\n```",
      "Revised:",
      "```" + HANDOFF_PROPOSAL_FENCE + "\n" + JSON.stringify({ goal: "Ship search", decisions: "- Keep the API", extra: 1, verified: 3 }) + "\n```",
    ].join("\n");
    expect(parseHandoffProposal(reply)).toEqual({ goal: "Ship search", decisions: "- Keep the API" });
    expect(parseHandoffProposal("```" + HANDOFF_PROPOSAL_FENCE + "\n{not json}\n```")).toBeNull();
    expect(parseHandoffProposal("No proposal here.")).toBeNull();
    expect(buildHandoffUpdateRequest(null)).toContain("```json\n{}\n```");
  });

  test("a proposal shows until the record says it", () => {
    const message = (id: string, content: string): ChatMessage =>
      ({ id, role: "assistant", model: "m", providerId: "codex", content, parts: [] }) as ChatMessage;
    const reply = "```" + HANDOFF_PROPOSAL_FENCE + "\n" + JSON.stringify({ goal: "Ship search" }) + "\n```";
    expect(findHandoffProposal([message("m1", reply)], emptyHandoffRecord())).toMatchObject({ messageId: "m1", proposal: { goal: "Ship search" } });
    const saved = applyHandoffDraft({ record: emptyHandoffRecord(), draft: { ...EMPTY_DRAFT, goal: "Ship search" }, at: AT });
    expect(findHandoffProposal([message("m1", reply)], saved)).toBeNull();
  });
});

describe("handoff record store", () => {
  test("a database from before handoff records gains the table; a task reads an empty record", () => {
    const db = new Database(":memory:");
    const { store } = harness(db);
    expect(store.taskHandoffs.read({ workspaceId: "ws", taskId: "task" })).toEqual(emptyHandoffRecord());
    db.close();
  });

  test("saves round-trip, a stale save is a conflict that writes nothing, and the record goes with its task", () => {
    const { db, store } = harness();
    const saved = store.taskHandoffs.save({ workspaceId: "ws", taskId: "task", baseRevision: 0, draft: { ...EMPTY_DRAFT, decisions: "- Keep the API stable" }, at: AT });
    expect(saved).toMatchObject({ ok: true, record: { revision: 1 } });
    store.taskHandoffs.save({ workspaceId: "ws", taskId: "other", baseRevision: 0, draft: { ...EMPTY_DRAFT, goal: "Other" }, at: AT });
    const stale = store.taskHandoffs.save({ workspaceId: "ws", taskId: "task", baseRevision: 0, draft: { ...EMPTY_DRAFT, goal: "Mine" }, at: AT });
    expect(stale).toMatchObject({ ok: false, conflict: true, record: { revision: 1 } });
    expect(store.taskHandoffs.read({ workspaceId: "ws", taskId: "task" }).sections.goal).toBeUndefined();
    // Saving the workspace upserts task rows in place and keeps records.
    db.run("INSERT INTO tasks (id, workspace_id, title, provider, updated_at) VALUES ('ws:task', 'ws', 'Renamed', 'codex', ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title", [AT]);
    expect(store.taskHandoffs.read({ workspaceId: "ws", taskId: "task" }).revision).toBe(1);
    store.removeTaskFromWorkspace({ workspaceId: "ws", taskId: "task" });
    expect(store.taskHandoffs.read({ workspaceId: "ws", taskId: "task" })).toEqual(emptyHandoffRecord());
    expect(store.taskHandoffs.read({ workspaceId: "ws", taskId: "other" }).revision).toBe(1);
    db.close();
  });

  test("a save for a task this workspace does not have is refused and writes nothing", () => {
    const { db, store } = harness();
    const draft = { ...EMPTY_DRAFT, goal: "Ship" };
    // No such task, or a task deleted while its record was being edited.
    expect(store.taskHandoffs.save({ workspaceId: "ws", taskId: "missing", baseRevision: 0, draft, at: AT })).toMatchObject({ ok: false, missingTask: true });
    // The task belongs to another workspace.
    expect(store.taskHandoffs.save({ workspaceId: "elsewhere", taskId: "task", baseRevision: 0, draft, at: AT })).toMatchObject({ ok: false, missingTask: true });
    // Workspace "a:b" owns the row "a:b:c"; workspace "a" with task "b:c" names the same row id.
    db.run("INSERT INTO tasks (id, workspace_id, title, provider, updated_at) VALUES ('a:b:c', 'a:b', 'Task', 'codex', ?)", [AT]);
    expect(store.taskHandoffs.save({ workspaceId: "a", taskId: "b:c", baseRevision: 0, draft, at: AT })).toMatchObject({ ok: false, missingTask: true });
    expect(db.query("SELECT COUNT(*) AS count FROM task_handoff_records").get()).toEqual({ count: 0 });
    expect(store.taskHandoffs.save({ workspaceId: "a:b", taskId: "c", baseRevision: 0, draft, at: AT })).toMatchObject({ ok: true, record: { revision: 1 } });
    db.close();
  });

  test("the window saves a task created a moment ago once its workspace is stored", async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const calls: string[] = [];
    let taskStored = false;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        api: {
          persistence: {
            saveTaskHandoff: async () => {
              calls.push("save");
              return taskStored
                ? { ok: true, record: { version: 1, revision: 1, updatedAt: AT, sections: {} } }
                : { ok: false, missingTask: true, message: "The task is not stored in this workspace." };
            },
          },
        },
      },
    });
    try {
      const { saveTaskHandoff } = await import("@/lib/db/task-handoff.db");
      const response = await saveTaskHandoff(
        { workspaceId: "ws", taskId: "new-task", baseRevision: 0, draft: { ...EMPTY_DRAFT, goal: "Ship" } },
        { storeTask: async () => { calls.push("store"); taskStored = true; } },
      );
      expect(response).toMatchObject({ ok: true });
      expect(calls).toEqual(["save", "store", "save"]);
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });

  test("preload -> validated IPC -> SQLite saves and reads, and rejects malformed input", async () => {
    const saved = await bridge.saveTaskHandoff({ workspaceId: "ws", taskId: "task", baseRevision: 0, draft: { ...EMPTY_DRAFT, goal: "Ship" } });
    expect(saved).toMatchObject({ ok: true, record: { revision: 1, sections: { goal: { text: "Ship", updatedBy: "user" } } } });
    expect(await bridge.readTaskHandoff({ workspaceId: "ws", taskId: "task" })).toMatchObject({ ok: true, record: { revision: 1 } });
    expect(await bridge.saveTaskHandoff({ workspaceId: "ws", taskId: "task", baseRevision: -1, draft: EMPTY_DRAFT } as never)).toMatchObject({ ok: false });
    expect(await bridge.readTaskHandoff({ workspaceId: "", taskId: "task" })).toMatchObject({ ok: false });
    expect(await bridge.saveTaskHandoff({ workspaceId: "ws", taskId: "ghost", baseRevision: 0, draft: { ...EMPTY_DRAFT, goal: "Ship" } })).toMatchObject({ ok: false, missingTask: true });
    expect(await bridge.readTaskHandoff({ workspaceId: "ws", taskId: "ghost" })).toMatchObject({ ok: true, record: { revision: 0 } });
  });
});

describe("handoff record in the provider prompt", () => {
  const record: TaskHandoffRecord = applyHandoffDraft({
    record: emptyHandoffRecord(),
    draft: { ...EMPTY_DRAFT, decisions: "- Keep the public API stable" },
    at: AT,
  });
  const history: ChatMessage[] = [
    { id: "u1", role: "user", model: "user", providerId: "user", content: "Build search", parts: [] },
    { id: "a1", role: "assistant", model: "m", providerId: "claude-code", content: "Done", parts: [] },
  ];
  const prompt = (providerId: ProviderId, resume?: { nativeSessionId: string; syncedThroughMessageId?: string }) =>
    buildProviderTurnPrompt({
      providerId,
      prompt: "next",
      conversation: buildCanonicalConversationRequest({
        turnId: "t", taskId: "task", workspaceId: "ws", providerId, history, userInput: "next",
        nativeSessionId: resume?.nativeSessionId ?? null, syncedThroughMessageId: resume?.syncedThroughMessageId ?? null,
        retrievedContextParts: [buildHandoffRecordContextPart(record)!],
      }),
    });

  test("a provider starting or coming back reads the record before the conversation excerpt", () => {
    for (const providerId of ["codex", "claude-code", "cursor"] as const) {
      const text = prompt(providerId);
      expect(text.indexOf("[Task Handoff Record]")).toBeGreaterThan(-1);
      expect(text.indexOf("[Task Handoff Record]")).toBeLessThan(text.indexOf("[Task Shared Context]"));
      expect(text).toContain("- Keep the public API stable");
      expect(text).not.toContain("source: stave:handoff-record");
    }
    expect(prompt("claude-code", { nativeSessionId: "s", syncedThroughMessageId: "u1" })).toContain("[Task Handoff Record]");
  });

  test("a session that is up to date is not sent the record again", () => {
    expect(prompt("claude-code", { nativeSessionId: "s", syncedThroughMessageId: "a1" })).not.toContain("[Task Handoff Record]");
  });

  test("an empty record adds nothing", () => {
    expect(buildHandoffRecordContextPart(emptyHandoffRecord())).toBeNull();
  });
});

describe("handoff panel", () => {
  test("shows each section with who updated it, and empty ones as not written", () => {
    const record = applyHandoffDraft({
      record: emptyHandoffRecord(),
      draft: { ...EMPTY_DRAFT, decisions: "- Keep the public API stable" },
      authors: { decisions: "agent" },
      at: new Date().toISOString(),
    });
    const html = renderToStaticMarkup(createElement(TaskHandoffEditor, {
      draftKey: "ws:render", workspaceId: "ws", taskId: "render", record, onSaved: () => {},
    }));
    expect(html).toContain("Approved decisions");
    expect(html).toContain("- Keep the public API stable");
    expect(html).toContain("by the agent");
    expect(html).toContain("Not written yet.");
    expect(html).toContain("Fill from this task");
    expect(html).toContain("Ask the agent to update");
  });
});
