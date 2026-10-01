import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import { SqliteStore } from "../electron/persistence/sqlite-store";
import {
  projectTurnStatus,
  resolveTargetedTurnError,
  resolveTargetedTurnOutcome,
} from "../electron/host-service/local-mcp-turn-journal";

function harness() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE turns (id TEXT PRIMARY KEY, workspace_id TEXT, task_id TEXT, provider_id TEXT, created_at TEXT, completed_at TEXT, usage_json TEXT, receipt_json TEXT);
    CREATE TABLE turn_events (id TEXT PRIMARY KEY, turn_id TEXT, sequence INTEGER, event_type TEXT, payload_json TEXT, created_at TEXT);`);
  // Execute the production store's SQL and compaction, with Bun's SQLite driver.
  const store = Object.create(SqliteStore.prototype) as SqliteStore;
  Object.assign(store, { db, _closed: false });
  store.beginTurn({
    id: "turn",
    workspaceId: "workspace",
    taskId: "task",
    providerId: "codex",
  });
  return { db, store };
}

describe("durable turn completion", () => {
  test("normal reply survives actual completeTurn compaction", () => {
    const { db, store } = harness();
    store.saveStreamEvents({
      turnId: "turn",
      events: [
        { sequence: 1, event: { type: "text", text: "A normal reply" } },
        { sequence: 2, event: { type: "done" } },
      ],
    });
    store.completeTurn({ id: "turn" });
    const turn = store.listTurns({
      workspaceId: "workspace",
      taskId: "task",
    })[0]!;
    expect(
      store.getStreamEvents({ turnId: "turn" }).map((entry) => entry.eventType),
    ).toEqual(["done"]);
    expect(
      resolveTargetedTurnError({
        completedAt: turn.completedAt,
        receipt: turn.terminalReceipt,
        events: store.getStreamEvents({ turnId: "turn" }),
      }),
    ).toBeNull();
    db.close();
  });
});

test("bounds raw output before payload truncation and active pruning", () => {
  const { db, store } = harness();
  store.saveStreamEvent({
    turnId: "turn",
    sequence: 1,
    event: { type: "text", text: "reply".repeat(20000) },
  });
  expect(store.getStreamEvents({ turnId: "turn" })[0]!.truncated).toBe(true);
  store.saveStreamEvents({
    turnId: "turn",
    events: Array.from({ length: 2100 }, (_, i) => ({
      sequence: i + 2,
      event: { type: "thinking" as const, text: "thinking" },
    })),
  });
  expect(
    store
      .getStreamEvents({ turnId: "turn" })
      .some((entry) => entry.sequence === 1),
  ).toBe(false);
  store.saveStreamEvent({
    turnId: "turn",
    sequence: 2200,
    event: { type: "done" },
  });
  store.completeTurn({ id: "turn" });
  expect(store.getTurnReceipt("turn")).toMatchObject({
    outcome: "completed",
    outputObserved: true,
  });
  expect(store.getTurnReceipt("turn")!.responseText!.length).toBe(16384);
  db.close();
});

test("tool-only output, empty output, failure and cancellation stay distinct", () => {
  for (const [events, outcome, error] of [
    [
      [
        { type: "tool_result", tool_use_id: "tool", content: "result" },
        { type: "done" },
      ],
      "completed",
      null,
    ],
    [
      [{ type: "text", text: "   " }, { type: "done" }],
      "failed",
      "Provider turn ended without a response.",
    ],
    [
      [
        { type: "text", text: "partial" },
        { type: "error", message: "runtime error", recoverable: false },
        { type: "done", stop_reason: "runtime_failure" },
      ],
      "failed",
      "runtime error",
    ],
    [
      [
        { type: "text", text: "partial" },
        { type: "done", stop_reason: "user_abort" },
      ],
      "cancelled",
      "Provider turn was interrupted before it completed.",
    ],
    [[{ type: "text", text: "partial" }], "unknown", null],
  ] as const) {
    const { db, store } = harness();
    store.saveStreamEvents({
      turnId: "turn",
      events: events.map((event, i) => ({
        sequence: i + 1,
        event: event as import("../electron/providers/types").BridgeEvent,
      })),
    });
    store.completeTurn({ id: "turn" });
    expect(store.getTurnReceipt("turn")).toMatchObject({ outcome, error });
    db.close();
  }
});

test("duplicate inserts and late completion cannot change a cancelled receipt", () => {
  const { db, store } = harness();
  store.saveStreamEvent({
    turnId: "turn",
    sequence: 1,
    event: { type: "thinking", text: "thinking" },
  });
  store.saveStreamEvent({
    turnId: "turn",
    sequence: 1,
    event: { type: "text", text: "duplicate" },
  });
  expect(store.getTurnReceipt("turn")!.outputObserved).toBe(false);
  store.completeTurn({
    id: "turn",
    completedAt: "2026-10-01T00:00:00Z",
    stopReason: "user_abort",
  });
  const receipt = store.getTurnReceipt("turn");
  store.saveStreamEvent({
    turnId: "turn",
    sequence: 2,
    event: { type: "done" },
  });
  store.completeTurn({ id: "turn" });
  expect(store.getTurnReceipt("turn")).toEqual(receipt);
  db.close();
});

test("legacy compacted or truncated evidence is unknown and does not inherit another turn", () => {
  const { db, store } = harness();
  db.prepare("UPDATE turns SET receipt_json = NULL WHERE id = ?").run("turn");
  store.saveStreamEvent({
    turnId: "turn",
    sequence: 1,
    event: { type: "done" },
  });
  store.completeTurn({ id: "turn" });
  const turn = store.listTurns({
    workspaceId: "workspace",
    taskId: "task",
    turnId: "turn",
  })[0]!;
  expect(turn.terminalReceipt).toBeNull();
  expect(
    resolveTargetedTurnError({
      completedAt: turn.completedAt,
      events: store.getStreamEvents({ turnId: "turn" }),
    }),
  ).toBeNull();
  expect(
    resolveTargetedTurnOutcome({
      completedAt: turn.completedAt,
      events: store.getStreamEvents({ turnId: "turn" }),
    }),
  ).toBe("unknown");
  store.beginTurn({
    id: "other",
    workspaceId: "workspace",
    taskId: "task",
    providerId: "codex",
  });
  store.saveStreamEvents({
    turnId: "other",
    events: [
      { sequence: 1, event: { type: "text", text: "Other response" } },
      { sequence: 2, event: { type: "done" } },
    ],
  });
  store.completeTurn({ id: "other" });
  expect(
    store.listTurns({
      workspaceId: "workspace",
      taskId: "task",
      turnId: "turn",
    })[0]!.terminalReceipt,
  ).toBeNull();
  db.close();
});

test("raw oversized errors and provider response identity survive completion", () => {
  const { db, store } = harness();
  store.saveStreamEvents({
    turnId: "turn",
    events: [
      {
        sequence: 1,
        event: {
          type: "provider_turn",
          providerId: "codex",
          nativeSessionId: "session",
          nativeTurnId: "native-turn",
        },
      },
      {
        sequence: 2,
        event: {
          type: "error",
          message: "error".repeat(20000),
          recoverable: false,
        },
      },
      { sequence: 3, event: { type: "done", stop_reason: "runtime_failure" } },
    ],
  });
  store.completeTurn({ id: "turn" });
  expect(store.getTurnReceipt("turn")).toMatchObject({
    outcome: "failed",
    nativeTurnId: "native-turn",
  });
  expect(store.getTurnReceipt("turn")!.error!.length).toBe(8192);
  db.close();
});

test("receipt survives closing and reopening SQLite", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "stave-turn-receipt-"));
  const filename = path.join(directory, "test.sqlite");
  const { db, store } = harness();
  try {
    store.saveStreamEvents({
      turnId: "turn",
      events: [
        { sequence: 1, event: { type: "text", text: "persistent reply" } },
        { sequence: 2, event: { type: "done" } },
      ],
    });
    store.completeTurn({ id: "turn" });
    db.run("VACUUM INTO ?", [filename]);
    db.close();
    const reopenedDb = new Database(filename);
    const reopenedStore = Object.create(SqliteStore.prototype) as SqliteStore;
    Object.assign(reopenedStore, { db: reopenedDb, _closed: false });
    expect(reopenedStore.getTurnReceipt("turn")).toMatchObject({
      outcome: "completed",
      responseText: "persistent reply",
    });
    expect(
      reopenedStore
        .getStreamEvents({ turnId: "turn" })
        .map((entry) => entry.eventType),
    ).toEqual(["done"]);
    reopenedDb.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("all shared failure and cancellation stop reasons preserve terminal outcome", () => {
  for (const [reason, outcome] of [
    ["canceled", "cancelled"],
    ["cancelled", "cancelled"],
    ["interrupted", "cancelled"],
    ["aborted", "failed"],
    ["error", "failed"],
    ["failed", "failed"],
    ["max_tokens", "failed"],
    ["output_overflow", "failed"],
  ] as const) {
    const { db, store } = harness();
    store.saveStreamEvents({
      turnId: "turn",
      events: [
        { sequence: 1, event: { type: "text", text: "partial" } },
        { sequence: 2, event: { type: "done", stop_reason: reason } },
      ],
    });
    store.completeTurn({ id: "turn" });
    expect(store.getTurnReceipt("turn")!.outcome).toBe(outcome);
    db.close();
  }
});

test("status uses full exact-turn message ahead of bounded receipt and ignores earlier responses", () => {
  const { db, store } = harness();
  const fullText = "reply".repeat(5000);
  store.saveStreamEvents({
    turnId: "turn",
    events: [
      { sequence: 1, event: { type: "text", text: fullText } },
      { sequence: 2, event: { type: "done" } },
    ],
  });
  store.completeTurn({ id: "turn" });
  const turn = store.listTurns({
    workspaceId: "workspace",
    taskId: "task",
  })[0]!;
  const message = {
    id: "response",
    role: "assistant" as const,
    model: "model",
    providerId: "codex" as const,
    content: fullText,
    isStreaming: false,
    parts: [],
    turnId: "turn",
  };
  const project = (messages: (typeof message)[]) =>
    projectTurnStatus({
      turn,
      messages,
      targeted: true,
      memoryError: "stale error",
      readEvents: (id) => store.getStreamEvents({ turnId: id }),
    });
  expect(project([message]).latestAssistantText).toBe(fullText);
  expect(project([message]).latestTurnError).toBeNull();
  expect(
    project([{ ...message, turnId: "earlier", content: "old response" }])
      .latestAssistantText,
  ).toBe(fullText.slice(0, 16384));
  expect(
    projectTurnStatus({
      turn: null,
      messages: [message],
      targeted: true,
      memoryError: null,
      readEvents: () => [],
    }).latestAssistantText,
  ).toBeNull();
  db.close();
});

test("bootstrap upgrades an old turns table without inventing receipts", () => {
  const db = new Database(":memory:");
  db.exec(
    "CREATE TABLE turns (id TEXT PRIMARY KEY, workspace_id TEXT, task_id TEXT, provider_id TEXT, created_at TEXT, completed_at TEXT, usage_json TEXT)",
  );
  db.run(
    "INSERT INTO turns VALUES ('old', 'workspace', 'task', 'codex', '2026-01-01', '2026-01-02', NULL)",
  );
  const store = Object.create(SqliteStore.prototype) as SqliteStore;
  Object.assign(store, { db, _closed: false });
  (store as unknown as { bootstrap: () => void }).bootstrap();
  expect(store.getTurnReceipt("old")).toBeNull();
  store.beginTurn({
    id: "new",
    workspaceId: "workspace",
    taskId: "task",
    providerId: "codex",
  });
  expect(store.getTurnReceipt("new")!.outputObserved).toBe(false);
  db.close();
});

test("workspace active and latest summaries expose exact-turn receipt", () => {
  const { db, store } = harness();
  store.saveStreamEvent({
    turnId: "turn",
    sequence: 1,
    event: { type: "text", text: "reply" },
  });
  expect(
    store.listActiveTurnsForWorkspace({ workspaceId: "workspace" })[0]!
      .terminalReceipt,
  ).toMatchObject({ outputObserved: true, completedAt: null });
  store.saveStreamEvent({
    turnId: "turn",
    sequence: 2,
    event: { type: "done" },
  });
  store.completeTurn({ id: "turn" });
  expect(
    store.listLatestTurnsForWorkspace({ workspaceId: "workspace" })[0]!
      .terminalReceipt,
  ).toMatchObject({ outcome: "completed", responseText: "reply" });
  db.close();
});


test("recovery is ordered after the last error and survives compaction", () => {
  for (const [events, outcome, error] of [
    [[
      { type: "error", message: "Edit failed", recoverable: false },
      { type: "text", text: "Retry succeeded" },
      { type: "done", stop_reason: "end_turn" },
    ], "completed", null],
    [[
      { type: "error", message: "Edit failed", recoverable: false },
      { type: "text", text: "Retry succeeded" },
      { type: "error", message: "Runtime unavailable", recoverable: true },
      { type: "usage", inputTokens: 1, outputTokens: 1 },
      { type: "done", stop_reason: "completed" },
    ], "failed", "Runtime unavailable"],
    [[
      { type: "error", message: "Authentication failed", recoverable: false },
      { type: "text", text: "Trailing output" },
      { type: "done", stop_reason: "runtime_failure" },
    ], "failed", "Authentication failed"],
  ] as const) {
    const { db, store } = harness();
    store.saveStreamEvents({
      turnId: "turn",
      events: events.map((event, index) => ({ sequence: index + 1, event })),
    });
    store.completeTurn({ id: "turn" });
    expect(store.getTurnReceipt("turn")).toMatchObject({ outcome, error });
    expect(resolveTargetedTurnOutcome({
      completedAt: "2026-10-01", receipt: store.getTurnReceipt("turn"),
      events: store.getStreamEvents({ turnId: "turn" }),
    })).toBe(outcome);
    db.close();
  }
});
