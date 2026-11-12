import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { projectTarsActivity, groupTarsActivity } from "../src/lib/tars/activity";
import { TarsActionRecordSchema, type TarsConversation } from "../src/lib/tars/conversation";
import { SETTINGS } from "./tars-test-context";

const NOW = "2026-11-12T12:00:00.000Z";
const OLD = "2026-11-10T12:00:00.000Z";
const empty = (): TarsConversation => ({ settings: null, messages: [], receipts: [], records: [], activity: [] });
const record = (id: string, automatic = true) => TarsActionRecordSchema.parse({ requestId: id, requestHash: "a".repeat(64),
  source: automatic ? "automatic" : "click", action: { kind: "control", operation: "pause", responsibilityId: "work", expectedRevision: 1 },
  status: "applied", error: null, reason: null, revision: 1, createdAt: NOW, updatedAt: NOW,
  undo: { kind: "unstarted", afterRevision: 2, detail: null } });

test("activity sorts independent inputs, groups local days, filters origin and offers only existing Undo", () => {
  const conversation = empty();
  const historical = { ...record("historical"), createdAt: OLD, undo: undefined };
  const undone = record("undone"); undone.undo!.undoneAt = NOW;
  conversation.records = [historical, record("automatic"), record("manual", false), undone];
  conversation.activity = [{ id: "checks", responsibilityId: "work", revision: 5, title: "Search", state: "running", detail: null, createdAt: "2026-11-12T13:00:00.000Z",
    prChecks: { state: "failed", checkedAt: NOW, failing: ["unit"], headSha: "a".repeat(40) } }];
  const entries = projectTarsActivity(conversation, []);
  expect(entries[0]?.id).toBe("activity:checks");
  expect(entries.at(-1)?.id).toBe("record:historical");
  expect(entries.filter(entry => entry.undo).map(entry => entry.id)).toEqual(["record:automatic", "record:manual"]);
  expect(groupTarsActivity(entries).map(group => group.entries.length)).toEqual([4, 1]);
  expect(groupTarsActivity(entries, "tars").flatMap(group => group.entries).every(entry => entry.doneByTars)).toBe(true);
  expect(groupTarsActivity(entries, "tars").flatMap(group => group.entries).some(entry => entry.id === "record:manual")).toBe(false);
  expect(groupTarsActivity(entries, "needsYou")).toEqual([]);
  expect(groupTarsActivity(entries.slice().reverse())).toEqual(groupTarsActivity(entries));
});

test("waiting, dismissed, invalid and withdrawn decisions share the canonical liveness projection", () => {
  const db = new Database(":memory:");
  try {
    const conversations = new TarsConversationStore(db); conversations.configure(SETTINGS);
    const store = new TarsStore(db);
    const row = store.create({ requestId: "work", title: "Search", instruction: "Fix search", acceptanceCriteria: ["Works"], workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, NOW);
    const queued = conversations.create({ requestId: "question", text: "What next?" }, NOW);
    const claimed = conversations.claim(queued.id, queued.revision, NOW);
    const ask = { kind: "ask" as const, question: "Continue?", options: [ { label: "Yes", rationale: "Continue", effect: { kind: "control" as const, responsibilityId: row.id, expectedRevision: row.revision, operation: "pause" as const } },
      { label: "Later", rationale: "Wait", effect: { kind: "reply" as const } } ] };
    const message = conversations.answer(claimed.id, claimed.revision, { reply: "Choose", actions: [ask] }, NOW);
    const intent = conversations.recordReceipt(message.id, message.revision, 0, ask, NOW);
    const receipt = conversations.settleReceipt(message.id, 0, intent.revision, { status: "proposed" }, NOW);
    const conversation = { ...empty(), messages: [message], receipts: [receipt] };
    const waiting = projectTarsActivity(conversation, [row]);
    expect(groupTarsActivity(waiting, "needsYou").flatMap(group => group.entries)).toHaveLength(1);
    const decisionId = `ask:${message.id}:0`;
    const answer = { decisionId, optionIndex: 0, source: "click" as const, effect: { kind: "dismiss" as const }, label: null, status: "applied" as const,
      reason: null, error: null, actRequestId: null, messageId: message.id, revision: 1, createdAt: NOW, updatedAt: NOW };
    const dismissed = projectTarsActivity({ ...conversation, answers: [answer] }, [row]);
    expect(dismissed[0]?.content).toMatchObject({ kind: "decision", decision: { state: "dismissed" } });
    expect(dismissed[0]?.origin).toBe("you");
    const withdrawn = projectTarsActivity({ ...conversation, answers: [{ ...answer, source: "tars", effect: { kind: "withdraw" } }] }, [row]);
    expect(withdrawn[0]?.content).toMatchObject({ kind: "decision", decision: { state: "withdrawn" } });
    expect(withdrawn[0]?.doneByTars).toBe(true);
    const laterMessage = { ...message, id: "later", createdAt: "2026-11-12T13:00:00.000Z", decision: { reply: "Next", actions: [] } };
    const stillWaiting = projectTarsActivity({ ...conversation, messages: [message, laterMessage] }, [row]);
    expect(stillWaiting[0]?.content).toMatchObject({ kind: "decision", decision: { state: "waiting", latest: false } });
    expect(groupTarsActivity(stillWaiting, "needsYou").flatMap(group => group.entries)).toHaveLength(1);
    const addressed = { ...laterMessage, id: "same-work", createdAt: "2026-11-12T14:00:00.000Z",
      decision: { reply: "Here is the work", actions: [{ kind: "show" as const, responsibilityId: row.id, view: "report" as const }] } };
    const retired = projectTarsActivity({ ...conversation, messages: [message, laterMessage, addressed] }, [row]);
    expect(retired[0]?.content).toMatchObject({ kind: "decision", decision: { state: "retired" } });
    expect(retired[0]?.at).toBe(addressed.createdAt);
    expect(groupTarsActivity(retired, "needsYou")).toEqual([]);
    const invalid = projectTarsActivity({ ...conversation, activity: [
      { id: "created", responsibilityId: row.id, title: row.title, revision: row.revision, state: row.state, detail: null, createdAt: NOW },
      { id: "changed", responsibilityId: row.id, title: row.title, revision: row.revision + 1, state: row.state, detail: null, createdAt: laterMessage.createdAt },
    ] }, [{ ...row, revision: row.revision + 1 }]);
    expect(groupTarsActivity(invalid, "needsYou")).toEqual([]);
    const expired = invalid.find(entry => entry.content.kind === "decision");
    expect(expired?.content).toMatchObject({ kind: "decision", decision: { state: "invalid" } });
    expect(expired?.at).toBe(laterMessage.createdAt);
  } finally { db.close(); }
});

test("automatic receipts merge into their Undo record", () => {
  const conversation = empty();
  conversation.records = [record("auto:message:0")];
  conversation.receipts = [{ messageId: "message", actionIndex: 0, action: conversation.records[0]!.action,
    status: "applied", responsibilityId: "work", requestHash: "a".repeat(64), revision: 1, error: null, reason: null, createdAt: NOW, updatedAt: NOW } as TarsConversation["receipts"][number]];
  expect(projectTarsActivity(conversation, [])).toHaveLength(1);
});

test("workspace Undo, delegation and publication project once with their original work titles", () => {
  const conversation = empty();
  const base = { requestHash: "a".repeat(64), revision: 1, error: null, reason: null, createdAt: NOW, updatedAt: NOW };
  const workspaceAction = { kind: "workspace" as const, workspaceId: "source", operation: "addTodo" as const, text: "Check search" };
  conversation.records.push(TarsActionRecordSchema.parse({ ...base, requestId: "workspace:message:0", source: "words", action: workspaceAction, status: "applied",
    undo: { kind: "workspace", workspaceName: "Search workspace", repositoryPath: "/tmp/project", before: "{}", after: "{}" } }));
  conversation.receipts = [
    { ...base, messageId: "message", actionIndex: 0, action: workspaceAction, status: "applied", responsibilityId: null },
    { ...base, messageId: "message", actionIndex: 1, action: { kind: "delegate", workspaceId: "source", title: "Repair search", instruction: "Fix", acceptanceCriteria: ["Works"], priority: 50 }, status: "applied", responsibilityId: "work" },
    { ...base, messageId: "message", actionIndex: 2, action: { kind: "publish", responsibilityId: "work", expectedRevision: 1 }, status: "proposed", responsibilityId: null },
  ];
  conversation.publications = [{ ...base, requestId: "publish:message:2", proposal: { messageId: "message", actionIndex: 2 }, source: "automatic", responsibilityId: "work", expectedRevision: 1,
    commitMessage: "fix: search", title: "fix: search", status: "applied", url: "https://example.com/pull/1", number: 1 }];
  const entries = projectTarsActivity(conversation, []);
  expect(entries).toHaveLength(3);
  expect(entries.filter(entry => entry.undo).map(entry => entry.title)).toEqual(["Search workspace"]);
  expect(entries.find(entry => entry.id === "receipt:message:1")?.title).toBe("Repair search");
  expect(entries.filter(entry => entry.content.kind === "publication")).toHaveLength(1);
  expect(groupTarsActivity(entries, "needsYou")).toEqual([]);
});
