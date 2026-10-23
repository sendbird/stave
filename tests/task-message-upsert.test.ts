import { beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import type BetterSqlite3 from "better-sqlite3";
import { upsertTaskMessages } from "../electron/persistence/task-message-upsert";
import type { PersistenceChatMessageRow } from "../electron/persistence/types";

type Row = PersistenceChatMessageRow & {
  turnId?: string;
  startedAt?: string;
  completedAt?: string;
};

const WORKSPACE_ID = "ws-1";
const TASK_ID = "task-1";

let db: Database;

function upsert(messages: Row[]) {
  return upsertTaskMessages({
    db: db as unknown as BetterSqlite3.Database,
    workspaceId: WORKSPACE_ID,
    taskId: TASK_ID,
    messages,
  });
}

function stored(messageId: string) {
  const row = db
    .prepare("SELECT message_json FROM messages WHERE id = ?")
    .get(`${WORKSPACE_ID}:${TASK_ID}:${messageId}`) as
    | { message_json: string }
    | undefined;
  return row ? (JSON.parse(row.message_json) as Row) : null;
}

function textParts(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    type: "text",
    text: `part ${index + 1}`,
  }));
}

function userMessage(args: { id: string; content: string; startedAt: string }): Row {
  return {
    id: args.id,
    role: "user",
    model: "user",
    providerId: "user",
    content: args.content,
    startedAt: args.startedAt,
    parts: [{ type: "text", text: args.content }],
  };
}

function assistantMessage(args: {
  id: string;
  turnId?: string;
  content: string;
  partCount: number;
  isStreaming?: boolean;
  completedAt?: string;
}): Row {
  return {
    id: args.id,
    role: "assistant",
    model: "model-1",
    providerId: "claude-code",
    content: args.content,
    isStreaming: args.isStreaming ?? false,
    startedAt: "2026-01-01T00:00:00.000Z",
    ...(args.turnId ? { turnId: args.turnId } : {}),
    ...(args.completedAt ? { completedAt: args.completedAt } : {}),
    parts: textParts(args.partCount),
  };
}

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      role TEXT NOT NULL,
      model TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      content TEXT NOT NULL,
      is_streaming INTEGER NOT NULL DEFAULT 0,
      parts_json TEXT NOT NULL,
      message_json TEXT
    );
  `);
});

describe("upsertTaskMessages", () => {
  test("keeps a finished turn when a later message reuses its ids", () => {
    // The turn that a stale renderer lost track of.
    upsert([
      userMessage({ id: "m-9", content: "Build the spec app.", startedAt: "2026-01-01T07:17:56.000Z" }),
      assistantMessage({
        id: "m-10",
        turnId: "turn-a",
        content: "Published both language editions.",
        partCount: 6,
        completedAt: "2026-01-01T07:39:42.000Z",
      }),
    ]);

    // The stale renderer then numbers its next turn from the old count.
    const skipped = upsert([
      userMessage({ id: "m-9", content: "What did I ask last?", startedAt: "2026-01-01T10:08:02.000Z" }),
      assistantMessage({
        id: "m-10",
        turnId: "turn-b",
        content: "You asked about the old tool.",
        partCount: 2,
        completedAt: "2026-01-01T10:08:33.000Z",
      }),
    ]);

    expect(skipped).toEqual([
      { messageId: "m-9", reason: "identity" },
      { messageId: "m-10", reason: "identity" },
    ]);
    expect(stored("m-9")?.content).toBe("Build the spec app.");
    expect(stored("m-10")?.turnId).toBe("turn-a");
  });

  test("does not let an older copy shrink a finished assistant reply", () => {
    upsert([
      assistantMessage({
        id: "m-8",
        turnId: "turn-a",
        content: "Progress note. Final report with every published link.",
        partCount: 12,
        completedAt: "2026-01-01T07:07:26.000Z",
      }),
    ]);

    const skipped = upsert([
      assistantMessage({
        id: "m-8",
        turnId: "turn-a",
        content: "Progress note.",
        partCount: 4,
        completedAt: "2026-01-01T10:07:00.000Z",
      }),
    ]);

    expect(skipped).toEqual([{ messageId: "m-8", reason: "regression" }]);
    expect(stored("m-8")?.content).toBe(
      "Progress note. Final report with every published link.",
    );
  });

  test("refuses an older copy whose text grew inside the same part", () => {
    upsert([
      assistantMessage({
        id: "m-3",
        turnId: "turn-a",
        content: "Partial and final response",
        partCount: 1,
        completedAt: "2026-01-01T00:02:00.000Z",
      }),
    ]);
    const skipped = upsert([
      assistantMessage({
        id: "m-3",
        turnId: "turn-a",
        content: "Partial",
        partCount: 1,
        completedAt: "2026-01-01T03:00:00.000Z",
      }),
    ]);
    expect(skipped).toEqual([{ messageId: "m-3", reason: "regression" }]);
    expect(stored("m-3")?.content).toBe("Partial and final response");
    expect(stored("m-3")?.completedAt).toBe("2026-01-01T00:02:00.000Z");
  });

  test("keeps a question answered from an older copy", () => {
    const question = {
      type: "user_input",
      requestId: "question-1",
      toolName: "AskUserQuestion",
      questions: [],
      state: "input-requested",
    };
    upsert([
      {
        ...assistantMessage({
          id: "m-4",
          turnId: "turn-a",
          content: "Asked a question, then finished the rest of the work.",
          partCount: 0,
          completedAt: "2026-01-01T00:03:00.000Z",
        }),
        parts: [{ type: "text", text: "Asked a question" }, question, { type: "text", text: "rest" }],
      },
    ]);
    const skipped = upsert([
      {
        ...assistantMessage({
          id: "m-4",
          turnId: "turn-a",
          content: "Asked a question",
          partCount: 0,
          completedAt: "2026-01-01T03:00:00.000Z",
        }),
        parts: [
          { type: "text", text: "Asked a question" },
          { ...question, state: "input-responded", answers: { q: "yes" } },
        ],
      },
    ]);
    expect(skipped).toEqual([
      { messageId: "m-4", reason: "regression", mergedInteractions: 1 },
    ]);
    const row = stored("m-4");
    expect(row?.content).toBe("Asked a question, then finished the rest of the work.");
    expect(row?.parts).toHaveLength(3);
    expect(row?.parts[1]).toMatchObject({ requestId: "question-1", state: "input-responded" });
  });

  test("never reverts a stored answer to an older requested state", () => {
    const answered = {
      type: "user_input",
      requestId: "question-2",
      toolName: "AskUserQuestion",
      questions: [],
      answers: { q: "yes" },
      state: "input-responded",
    };
    upsert([
      {
        ...assistantMessage({
          id: "m-5",
          turnId: "turn-a",
          content: "Asked, got an answer, finished.",
          partCount: 0,
          completedAt: "2026-01-01T00:04:00.000Z",
        }),
        parts: [answered, { type: "text", text: "Asked, got an answer, finished." }],
      },
    ]);
    const skipped = upsert([
      {
        ...assistantMessage({
          id: "m-5",
          turnId: "turn-a",
          content: "Asked",
          partCount: 0,
          completedAt: "2026-01-01T03:00:00.000Z",
        }),
        parts: [{ ...answered, answers: undefined, state: "input-requested" }],
      },
    ]);
    expect(skipped).toEqual([{ messageId: "m-5", reason: "regression" }]);
    expect(stored("m-5")?.parts[0]).toMatchObject({
      state: "input-responded",
      answers: { q: "yes" },
    });
  });

  test("applies ordinary progress, completion and same-size edits", () => {
    upsert([
      assistantMessage({
        id: "m-2",
        content: "",
        partCount: 0,
        isStreaming: true,
      }),
    ]);
    // The turn id arrives with the first event.
    expect(
      upsert([
        assistantMessage({
          id: "m-2",
          turnId: "turn-a",
          content: "Working",
          partCount: 2,
          isStreaming: true,
        }),
      ]),
    ).toEqual([]);
    expect(
      upsert([
        assistantMessage({
          id: "m-2",
          turnId: "turn-a",
          content: "Working. Done.",
          partCount: 3,
          completedAt: "2026-01-01T00:01:00.000Z",
        }),
      ]),
    ).toEqual([]);
    // A finished reply can still change without shrinking, e.g. an answered
    // question part.
    expect(
      upsert([
        assistantMessage({
          id: "m-2",
          turnId: "turn-a",
          content: "Working. Done!",
          partCount: 3,
          completedAt: "2026-01-01T00:01:00.000Z",
        }),
      ]),
    ).toEqual([]);
    expect(stored("m-2")?.content).toBe("Working. Done!");

    // The same user message is rewritten in place.
    const user = userMessage({ id: "m-1", content: "Hello", startedAt: "2026-01-01T00:00:00.000Z" });
    upsert([user]);
    expect(upsert([{ ...user, content: "Hello there" }])).toEqual([]);
    expect(stored("m-1")?.content).toBe("Hello there");
  });
});
