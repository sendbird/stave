import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createTarsConversationService } from "../electron/main/tars-conversation-service";
import { applyTarsDecision, confirmTarsProposal, type TarsDecisionPorts } from "../electron/host-service/tars-decisions";
import { undoTarsAction } from "../electron/host-service/tars-action-undo";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { WorkspaceInformationStore } from "../electron/persistence/workspace-information-store";
import { createEmptyWorkspaceInformation } from "../src/lib/workspace-information";
import { TarsDecisionActionSchema, TarsActionRecordSchema, TarsUndoActionResultSchema, TarsConversationSchema } from "../src/lib/tars/conversation";
import { tarsWorkspaceRecordId, type TarsWorkspaceAction } from "../src/lib/tars/workspace-action";
import { tarsActionKey, tarsActionMode, type TarsAutonomyLevel } from "../src/lib/tars/autonomy";
import { projectTarsDecisions } from "../src/lib/tars/decisions";
import { buildTarsPlannerPrompt, parseTarsDecisionOutput } from "../electron/main/tars-planner";
import { REGISTRY, SETTINGS, testContext } from "./tars-test-context";

const NOW = "2026-11-12T00:00:00.000Z";
const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
const action = (patch: Partial<TarsWorkspaceAction> = {}) => ({ kind: "workspace", workspaceId: "source", operation: "addTodo", text: "Check the release" , ...patch }) as TarsWorkspaceAction;
const operations: TarsWorkspaceAction[] = [
  { kind: "workspace", workspaceId: "source", operation: "appendNotes", text: "New note" },
  { kind: "workspace", workspaceId: "source", operation: "replaceNotes", notes: "Replacement" },
  action(),
  { kind: "workspace", workspaceId: "source", operation: "updateTodo", todoId: "todo", status: "completed", text: "Verified" },
  { kind: "workspace", workspaceId: "source", operation: "removeTodo", todoId: "todo" },
  { kind: "workspace", workspaceId: "source", operation: "setField", fieldId: "field", value: "Next" },
  { kind: "workspace", workspaceId: "source", operation: "removeField", fieldId: "field" },
  { kind: "workspace", workspaceId: "source", operation: "addResource", resourceKind: "pull_request", url: "https://github.com/example/project/pull/2", title: "Fix" },
  { kind: "workspace", workspaceId: "source", operation: "removeResource", resourceKind: "pull_request", resourceId: "resource" },
];

function fixture(level: TarsAutonomyLevel = "balanced") {
  const db = new Database(":memory:"); databases.push(db);
  const conversations = new TarsConversationStore(db), responsibilities = new TarsStore(db);
  db.exec("CREATE TABLE workspaces (id TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL, updated_at TEXT NOT NULL)");
  const before = { ...createEmptyWorkspaceInformation(), notes: "Original\n notes ",
    todos: [{ id: "todo", text: "Original todo", completed: false, status: "in_progress" as const }],
    customFields: [{ id: "field", type: "text" as const, label: "Release", value: "Original" }],
    linkedPullRequests: [{ id: "resource", url: "https://github.com/example/project/pull/1", title: "Original PR", status: "open" as const, note: "Keep me" }] };
  db.prepare("INSERT INTO workspaces VALUES (?, ?, ?)").run("source", JSON.stringify({ workspaceInformation: before, promptDraftByTask: { task: "User draft" }, editorTabs: [{ id: "keep" }] }), NOW);
  const information = new WorkspaceInformationStore(db as never);
  let registry = REGISTRY;
  let changes = 0;
  const workspace = { read: (id: string) => information.read(id), write: (id: string, info: typeof before, now: string) => information.write(id, info, now), changed: () => { changes++; } };
  const ports: TarsDecisionPorts = { conversations, responsibilities, readRegistry: () => registry, workspace: workspace as TarsDecisionPorts["workspace"],
    control: async () => { throw new Error("Unexpected control"); }, requestTick() {}, now: () => NOW };
  conversations.configure({ ...SETTINGS, autonomy: level });
  let sequence = 0;
  const message = (actions: TarsWorkspaceAction[]) => {
    const queued = conversations.create({ requestId: `message-${sequence++}`, text: "Organize this workspace." }, NOW);
    const claimed = conversations.claim(queued.id, queued.revision, NOW);
    return conversations.answer(claimed.id, claimed.revision, { reply: "I will organize it.", actions }, NOW);
  };
  const apply = (actions: TarsWorkspaceAction[]) => { const saved = message(actions); return applyTarsDecision({ messageId: saved.id, expectedRevision: saved.revision }, ports); };
  const undo = (requestId: string, revision = 1) => undoTarsAction({ requestId, expectedRevision: revision }, { ...ports, serialize: async (_id, restore) => restore() });
  return { db, conversations, responsibilities, information, before, ports, message, apply, undo, changes: () => changes, setRegistry: (next: typeof REGISTRY) => { registry = next; } };
}

test.each(operations)("strict operation schema and reader accept $operation without granting extra fields", proposed => {
  expect(TarsDecisionActionSchema.safeParse(proposed).success).toBe(true);
  expect(TarsDecisionActionSchema.safeParse({ ...proposed, command: "anything" }).success).toBe(false);
  const parsed = parseTarsDecisionOutput(JSON.stringify({ reply: "Done", actions: [proposed, { ...proposed, unexpected: true }, action()] }));
  expect(parsed.actions).toEqual([proposed, action()]);
  expect(parsed.dropped?.[0]).toMatchObject({ index: 1, kind: "workspace", reason: "invalid" });
});

test.each([
  { ...action(), text: "x".repeat(2_001) }, { ...action(), workspaceId: "x".repeat(257) },
  { kind: "workspace", workspaceId: "source", operation: "updateTodo", todoId: "todo" },
  { kind: "workspace", workspaceId: "source", operation: "replaceNotes", notes: "x".repeat(32_001) },
  { kind: "workspace", workspaceId: "source", operation: "addResource", resourceKind: "pull_request", url: "file:///tmp/private" },
  { kind: "workspace", workspaceId: "source", operation: "setField", fieldId: "field", value: "x".repeat(8_001) },
])("rejects invalid workspace input %#", invalid => expect(TarsDecisionActionSchema.safeParse(invalid).success).toBe(false));

test.each(operations)("$operation uses the Information service, persists an undoable record and restores exact prior state", async proposed => {
  const f = fixture();
  const [receipt] = await f.apply([proposed]);
  expect(receipt?.status).toBe("applied");
  expect(f.information.read("source")).not.toEqual(f.before);
  const record = f.conversations.getAction(tarsWorkspaceRecordId(receipt!.messageId, 0))!;
  expect(TarsActionRecordSchema.parse(record)).toMatchObject({ action: proposed, status: "applied", undo: { kind: "workspace", workspaceName: "Source" } });
  const result = await f.undo(record.requestId);
  expect(TarsUndoActionResultSchema.parse(result).refusal).toBeNull();
  expect(f.information.read("source")).toEqual(f.before);
  expect(await f.undo(record.requestId)).toEqual(result);
  const shell = JSON.parse((f.db.prepare("SELECT snapshot_json FROM workspaces").get() as { snapshot_json: string }).snapshot_json);
  expect(shell.promptDraftByTask).toEqual({ task: "User draft" }); expect(shell.editorTabs).toEqual([{ id: "keep" }]);
});

test.each(["careful", "balanced", "handsOff"] as const)("%s follows the additive policy keys, retries receipts once, and confirms only held edits", async level => {
  for (const proposed of operations) {
    const f = fixture(level), message = f.message([proposed]);
    const ref = { messageId: message.id, expectedRevision: message.revision };
    const first = await applyTarsDecision(ref, f.ports);
    const held = level === "careful" && ["replaceNotes", "removeTodo", "removeField", "removeResource"].includes(proposed.operation);
    expect(tarsActionMode(tarsActionKey(proposed)!, level)).toBe(held ? "confirm" : "auto");
    expect(first[0]?.status).toBe(held ? "proposed" : "applied");
    if (held) {
      expect(f.information.read("source")).toEqual(f.before);
      const decisions = projectTarsDecisions({ messages: [message], receipts: first, records: [], answers: [], activity: [], responsibilities: [] });
      expect(decisions[0]).toMatchObject({ state: "waiting", options: [{ kind: "proposal", action: proposed }] });
      const confirmed = await confirmTarsProposal({ messageId: message.id, actionIndex: 0 }, f.ports);
      expect(confirmed.status).toBe("applied");
      expect(await confirmTarsProposal({ messageId: message.id, actionIndex: 0 }, f.ports)).toEqual(confirmed);
    }
    const after = f.information.read("source");
    await applyTarsDecision(ref, f.ports);
    expect(f.information.read("source")).toEqual(after);
    expect(f.conversations.listActions()).toHaveLength(1);
  }
});

test.each(["missing", "duplicate"])("refuses %s registry targets before any service edit", async kind => {
  const f = fixture(); f.setRegistry(kind === "missing" ? [] : [...REGISTRY, ...REGISTRY]);
  expect(await f.apply([action()])).toMatchObject([{ status: "rejected" }]);
  expect(f.information.read("source")).toEqual(f.before); expect(f.conversations.listActions()).toHaveLength(0);
});

test.each(["balanced", "careful"] as const)("concurrent %s retries join the same receipt and confirmation", async level => {
  const f = fixture(level), message = f.message([operations[1]!]);
  const ref = { messageId: message.id, expectedRevision: message.revision };
  const [first, retry] = await Promise.all([applyTarsDecision(ref, f.ports), applyTarsDecision(ref, f.ports)]);
  expect(retry).toEqual(first);
  if (level === "careful") {
    expect(first[0]?.status).toBe("proposed");
    const input = { messageId: message.id, actionIndex: 0 };
    const [confirmed, repeated] = await Promise.all([confirmTarsProposal(input, f.ports), confirmTarsProposal(input, f.ports)]);
    expect(repeated).toEqual(confirmed); expect(confirmed.status).toBe("applied");
  }
  expect(f.conversations.listActions()).toHaveLength(1);
});

test("does not overwrite user changes on Undo or after registry ownership changes", async () => {
  const f = fixture(), [receipt] = await f.apply([action()]);
  const id = tarsWorkspaceRecordId(receipt!.messageId, 0);
  const after = f.information.read("source");
  f.information.write("source", { ...after, notes: "User edit" }, NOW);
  expect((await f.undo(id)).refusal).toBe("stale");
  expect(f.information.read("source").notes).toBe("User edit");
  f.information.write("source", after, NOW); f.setRegistry([{ ...REGISTRY[0]!, repositoryPath: "/tmp/other" }]);
  expect((await f.undo(id)).refusal).toBe("outOfScope");
});

test("a held edit captures the state at confirmation and is refused if the target disappears", async () => {
  const f = fixture("careful"), [receipt] = await f.apply([operations[1]!]);
  f.information.write("source", { ...f.before, notes: "User's newer notes" }, NOW);
  await confirmTarsProposal({ messageId: receipt!.messageId, actionIndex: 0 }, f.ports);
  await f.undo(tarsWorkspaceRecordId(receipt!.messageId, 0));
  expect(f.information.read("source").notes).toBe("User's newer notes");
  const [removed] = await f.apply([operations[4]!]); f.setRegistry([]);
  expect(await confirmTarsProposal({ messageId: removed!.messageId, actionIndex: 0 }, f.ports)).toMatchObject({ status: "rejected" });
});

test("receipt failure rolls back Information and the activity record together", async () => {
  const f = fixture();
  f.db.exec(`CREATE TRIGGER reject_receipt BEFORE UPDATE ON tars_action_receipts WHEN json_extract(NEW.body_json, '$.status') = 'applied'
    BEGIN SELECT RAISE(ABORT, 'receipt failure'); END`);
  expect(await f.apply([action()])).toMatchObject([{ status: "rejected" }]);
  expect(f.information.read("source")).toEqual(f.before); expect(f.conversations.listActions()).toHaveLength(0);
});

test("resource upsert reuses canonical entries and Undo restores their prior metadata", async () => {
  const f = fixture(); const [receipt] = await f.apply([{ ...operations[7]!, url: f.before.linkedPullRequests[0]!.url } as TarsWorkspaceAction]);
  expect(f.information.read("source").linkedPullRequests).toHaveLength(1);
  expect(f.information.read("source").linkedPullRequests[0]?.title).toBe("Original PR");
  await f.undo(tarsWorkspaceRecordId(receipt!.messageId, 0)); expect(f.information.read("source")).toEqual(f.before);
});

test("automatic follow-ups cannot edit Information and never-do rules still hold edits", async () => {
  const f = fixture(); const message = f.message([action()]);
  f.conversations.configure({ ...SETTINGS, neverDo: ["never change a todo"] });
  expect(await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports)).toMatchObject([{ status: "proposed", matchedRules: [{ why: "action" }] }]);
  const followup = f.conversations.create({ requestId: "follow-up", text: "Organize it" }, NOW, undefined,
    { kind: "followUp", eventKey: "event", responsibilityId: "work", reason: "blocked", observedRevision: 1, summary: "Blocked" });
  const claimed = f.conversations.claim(followup.id, followup.revision, NOW);
  const answered = f.conversations.answer(claimed.id, claimed.revision, { reply: "Edit", actions: [action()] }, NOW);
  expect(await applyTarsDecision({ messageId: answered.id, expectedRevision: answered.revision }, f.ports)).toMatchObject([{ status: "rejected", reason: "notByFollowUp" }]);
});

test("planner documents workspace edits and their approval/Undo contract", () => {
  const f = fixture(), message = f.message([action()]);
  const prompt = buildTarsPlannerPrompt(message, testContext(f.responsibilities), []);
  expect(prompt).toContain("Use workspace when the user asks to note, track, link or organize");
  for (const proposed of operations) expect(prompt).toContain(`'${proposed.operation}'`);
  expect(prompt).toContain("wait for confirmation at careful");
  expect(prompt).toContain("Never invent todo, field or resource IDs");
});


test("the existing decision-answer service confirms workspace edits once and returns their records through the conversation contract", async () => {
  const f = fixture("careful");
  const [receipt] = await f.apply([operations[1]!]);
  const service = createTarsConversationService({ conversations: f.conversations, responsibilities: f.responsibilities,
    coordinator: {} as never, now: () => NOW, context: async () => testContext(f.responsibilities),
    applyDecision: input => applyTarsDecision(input, f.ports), confirmProposal: input => confirmTarsProposal(input, f.ports) });
  service.start();
  try {
    const input = { decisionId: `confirm:${receipt!.messageId}:0`, optionIndex: 0, source: "click" as const };
    const result = await service.answerDecision(input);
    expect(result.answer?.status).toBe("applied"); expect(result.refusal).toBeNull();
    expect(await service.answerDecision(input)).toEqual(result);
    expect(f.conversations.listActions()).toHaveLength(1);
    const conversation = TarsConversationSchema.parse(service.getConversation({}));
    expect(conversation.records[0]?.undo?.kind).toBe("workspace");
  } finally { service.stop(); }
});
