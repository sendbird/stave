import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyTarsDecision, type TarsDecisionPorts } from "../electron/host-service/tars-decisions";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";
import { buildTarsBrief, TarsBriefSchema } from "../src/lib/tars/brief";
import type { TarsDecisionAction, TarsMessageOrigin } from "../src/lib/tars/conversation";
import { TARS_ASSIGNMENT_MAX_CHARS, tarsSnapshotForWindow, type TarsResponsibility } from "../src/lib/tars/types";

const NOW = "2026-11-05T00:00:00.000Z";
const directories: string[] = [];
const databases: Database[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const REGISTRY = [{ repositoryPath: "/tmp/source-repository", workspaces: [{ id: "source-workspace" }] }] as PersistenceRepositoryRegistryEntry[];

/** A message longer than the run assignment, with line breaks, indentation, a tab and a code block, so it travels as `mandate`. */
const LONG_MESSAGE = [
  "Rotate the staging auth keys before Friday.",
  "",
  "```yaml",
  "auth:",
  "  signingKey: ${AUTH_SIGNING_KEY}",
  "\tpreviousKeys: []",
  "```",
  "",
  ...Array.from({ length: 400 }, (_, index) => `Step ${index + 1}: keep every line of this request exactly as written.`),
].join("\n");

function open(file: string) {
  const database = new Database(file); databases.push(database);
  return { conversations: new TarsConversationStore(database), responsibilities: new TarsStore(database) };
}

/** Stores on a file, so a test can close them and open the same file again as a restart does. */
function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "stave-tars-brief-")); directories.push(directory);
  const file = path.join(directory, "stave.sqlite");
  const stores = open(file);
  let sequence = 0;
  const ports = (): TarsDecisionPorts => ({ conversations: stores.conversations, responsibilities: stores.responsibilities, now: () => NOW,
    readRegistry: () => REGISTRY, requestTick: () => {} });
  /** Saves a user message, answers it with the given actions and admits them, as the host does. */
  const deliver = async (text: string, actions: TarsDecisionAction[], origin?: TarsMessageOrigin) => {
    stores.conversations.configure({ providerId: "codex", model: "chosen-model", maxTurns: 7 });
    const queued = stores.conversations.create({ requestId: `message-${sequence++}`, text }, NOW, undefined, origin);
    const claimed = stores.conversations.claim(queued.id, queued.revision, NOW);
    const answered = stores.conversations.answer(claimed.id, claimed.revision, { reply: "Delegated.", actions }, NOW);
    const receipts = await applyTarsDecision({ messageId: answered.id, expectedRevision: answered.revision }, ports());
    return { message: answered, receipts, rows: receipts.map((receipt) => stores.responsibilities.get(receipt.responsibilityId!)!) };
  };
  return { file, stores, ports, deliver };
}

function delegate(title: string, instruction: string, criteria = ["The behavior is verified."]): TarsDecisionAction {
  return { kind: "delegate", workspaceId: "source-workspace", title, instruction, acceptanceCriteria: criteria, priority: 50 };
}

/** The host's runtime over a store; the brief and snapshot reads need nothing else, so execution ports refuse. */
function runtime(store: TarsStore) {
  const refuse = async (): Promise<never> => { throw new Error("Execution is not part of this test."); };
  return createTarsRuntime({ store, validateScope: async () => {}, prepareWorkspace: refuse, prepareTask: refuse, findRun: refuse,
    startRun: refuse, observe: refuse, controlRun: refuse, now: () => NOW });
}

describe("a delegated unit's saved request", () => {
  test("keeps the user's message and Tars's instruction apart, out of the window's snapshot, and reads each unit's own back", async () => {
    const f = fixture();
    const first = await f.deliver(LONG_MESSAGE, [delegate("Rotate the keys", "Rotate the staging signing key only.\n\n- Keep the old key for 24 hours."),
      delegate("Update the runbook", "Document the rotation in docs/runbook.md.", ["The runbook names both keys.", "The links resolve."])]);
    const second = await f.deliver("Fix the flaky date-picker test.", [delegate("Fix the flaky test", "Make the date-picker test deterministic.")]);
    const [keys, runbook] = first.rows;
    const [flaky] = second.rows;

    // Saved exactly as sent and as proposed; the run's assignment still combines them (here through the mandate, as the message is long).
    expect(LONG_MESSAGE.length).toBeGreaterThan(TARS_ASSIGNMENT_MAX_CHARS);
    expect(keys!.request).toEqual({ messageId: first.message.id, text: LONG_MESSAGE, sentAt: first.message.createdAt });
    expect(keys!.delegatedInstruction).toBe("Rotate the staging signing key only.\n\n- Keep the old key for 24 hours.");
    expect(keys!.mandate).toBe(LONG_MESSAGE);
    expect(keys!.instruction).toContain("Proposed work unit within that mandate:\nRotate the staging signing key only.");
    expect(flaky!.instruction).toBe("Original user mandate:\nFix the flaky date-picker test.\n\nProposed work unit within that mandate:\nMake the date-picker test deterministic.");

    const host = runtime(f.stores.responsibilities);
    // The window's snapshot carries none of the long texts, for any row.
    const visible = await host.get();
    for (const row of visible.responsibilities) {
      expect(row).not.toHaveProperty("request");
      expect(row).not.toHaveProperty("delegatedInstruction");
      expect(row).not.toHaveProperty("mandate");
    }
    expect(visible.responsibilities.map((row) => row.acceptanceCriteria)).toContainEqual(["The runbook names both keys.", "The links resolve."]);

    // Each brief is its own unit's: two units of one message share the message, never the instruction.
    const briefs = await Promise.all([keys!, runbook!, flaky!].map((row) => host.brief({ responsibilityId: row.id })));
    for (const brief of briefs) TarsBriefSchema.parse(brief);
    expect(briefs.map((brief) => brief.responsibilityId)).toEqual([keys!.id, runbook!.id, flaky!.id]);
    expect(briefs.map((brief) => brief.request?.text)).toEqual([LONG_MESSAGE, LONG_MESSAGE, "Fix the flaky date-picker test."]);
    expect(briefs.map((brief) => brief.instruction)).toEqual([
      { source: "delegated", text: "Rotate the staging signing key only.\n\n- Keep the old key for 24 hours." },
      { source: "delegated", text: "Document the rotation in docs/runbook.md." },
      { source: "delegated", text: "Make the date-picker test deterministic." },
    ]);
    expect(briefs.every((brief) => brief.context === null)).toBe(true);
  });

  test("survives every state change and a restart unchanged", async () => {
    const f = fixture();
    const { rows: [row] } = await f.deliver(LONG_MESSAGE, [delegate("Rotate the keys", "Rotate the staging signing key only.")]);
    const before = buildTarsBrief(row!);
    expect(row!.state).toBe("queued");

    // Queued → preparing → running → waiting → completed, as execution writes it.
    let current: TarsResponsibility = row!;
    const store = f.stores.responsibilities;
    for (const patch of [{ state: "preparing" as const, taskId: "task-1" }, { executionWorkspaceId: "exec-1" }, { state: "running" as const, agentRunId: "run-1" },
      { state: "waiting" as const, detail: "Waiting for review." }, { state: "completed" as const, detail: null }]) {
      current = store.patch(current.id, current.revision, patch, NOW);
      expect(await runtime(store).brief({ responsibilityId: current.id })).toEqual(before);
    }

    // A restart opens the same file with new stores: the brief reads back byte for byte.
    for (const database of databases.splice(0)) database.close();
    const reopened = open(f.file);
    const host = runtime(reopened.responsibilities);
    expect(await host.brief({ responsibilityId: row!.id })).toEqual(before);
    expect(reopened.responsibilities.get(row!.id)?.state).toBe("resultReady");
    expect((await host.get()).responsibilities[0]).not.toHaveProperty("request");
  });

  test("records the question when the message was the user's choice on it", async () => {
    const f = fixture();
    const origin: TarsMessageOrigin = { kind: "answer", decisionId: "ask:message-earlier:0", optionIndex: 1, source: "click",
      question: "How many times should the webhook sender retry?", rationale: "Bounded retries keep the queue moving." };
    const { message, rows: [row] } = await f.deliver("Retry three times, then give up", [delegate("Add webhook retries", "Retry at most three times.")], origin);
    expect(row!.request).toEqual({ messageId: message.id, text: "Retry three times, then give up", sentAt: message.createdAt,
      answeredQuestion: "How many times should the webhook sender retry?" });
  });

  test("an admission replayed after a lost reply keeps its one row and its texts", async () => {
    const f = fixture();
    const { message, receipts, rows: [row] } = await f.deliver("Fix the flaky date-picker test.", [delegate("Fix the flaky test", "Make the test deterministic.")]);
    const again = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports());
    expect(again).toEqual(receipts);
    expect(f.stores.responsibilities.snapshot().responsibilities).toHaveLength(1);
    expect(f.stores.responsibilities.get(row!.id)?.request?.text).toBe("Fix the flaky date-picker test.");
  });

  test("work saved before the request was kept shows its whole assignment and no message, never a split guess", async () => {
    const f = fixture();
    // Admitted by an earlier version: one combined assignment and, for a long message, the attached mandate.
    const legacy = f.stores.responsibilities.create({ requestId: "tars-message:older:0", title: "Older work",
      instruction: "Original user mandate: attached in full as the \"Original user mandate\" context.\n\nProposed work unit within that mandate:\nShip it.",
      mandate: LONG_MESSAGE, acceptanceCriteria: ["Shipped."], workspaceId: "source-workspace", repositoryPath: "/tmp/source-repository", providerId: "codex" }, NOW);
    const created = f.stores.responsibilities.create({ requestId: "renderer-create", title: "Created without a message", instruction: "Verify the result.",
      acceptanceCriteria: ["Verified."], workspaceId: "source-workspace", repositoryPath: "/tmp/source-repository", providerId: "codex" }, NOW);
    const host = runtime(f.stores.responsibilities);
    expect(await host.brief({ responsibilityId: legacy.id })).toEqual({ responsibilityId: legacy.id, request: null,
      instruction: { source: "assignment", text: legacy.instruction }, context: LONG_MESSAGE });
    expect(await host.brief({ responsibilityId: created.id })).toEqual({ responsibilityId: created.id, request: null,
      instruction: { source: "assignment", text: "Verify the result." }, context: null });
  });

  test("names exactly one responsibility the host holds", async () => {
    const host = runtime(fixture().stores.responsibilities);
    await expect(host.brief({ responsibilityId: "missing" })).rejects.toThrow("The responsibility was not found.");
    await expect(host.brief({ responsibilityId: "missing", text: "invented" })).rejects.toThrow();
    await expect(host.brief({})).rejects.toThrow();
  });

  test("a window snapshot without long texts is returned as it is", () => {
    const snapshot = { responsibilities: [] as TarsResponsibility[] };
    expect(tarsSnapshotForWindow(snapshot)).toBe(snapshot);
  });
});
