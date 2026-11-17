import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { applyTarsDecision, type TarsDecisionPorts } from "../electron/host-service/tars-decisions";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import type { TarsDecisionAction, TarsMessageInput, TarsConversationSettings } from "../src/lib/tars/conversation";
import { TARS_ASSIGNMENT_MAX_CHARS, TARS_MESSAGE_MAX_CHARS, type TarsResponsibility } from "../src/lib/tars/types";

import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";

const NOW = "2026-11-05T00:00:00.000Z";
const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });
const delegate = (title = "Repair search"): TarsDecisionAction => ({ kind: "delegate", workspaceId: "source-workspace", title,
  instruction: "Repair search and verify its behavior.", acceptanceCriteria: ["Search finds the requested item."], priority: 50 });

function fixture() {
  const database = new Database(":memory:"); databases.push(database);
  const conversations = new TarsConversationStore(database);
  const responsibilities = new TarsStore(database);
  const scopes: string[] = [];
  let registry = [{ repositoryPath: "/tmp/source-repository", workspaces: [{ id: "source-workspace" }] }] as PersistenceRepositoryRegistryEntry[];
  let ticks = 0;
  let sequence = 0;
  const ports: TarsDecisionPorts = { conversations, responsibilities, now: () => NOW,
    readRegistry: () => { scopes.push("read"); return registry; }, requestTick: () => { ticks++; } };
  const message = (actions: TarsDecisionAction[] = [delegate()], overrides: Partial<TarsMessageInput & TarsConversationSettings> = {}) => {
    const { text, requestId, attachments, includeWorkingChanges, ...settings } = overrides;
    conversations.configure({ providerId: "codex", model: "chosen-model", maxTurns: 7, ...settings });
    const queued = conversations.create({ requestId: requestId ?? `message-${sequence++}`,
      text: text ?? "Repair search. Preserve existing customer data.", ...(attachments ? { attachments } : {}), ...(includeWorkingChanges ? { includeWorkingChanges } : {}) }, NOW);
    const claimed = conversations.claim(queued.id, queued.revision, NOW);
    return conversations.answer(claimed.id, claimed.revision, { reply: "I will verify the search repair.", actions }, NOW);
  };
  const responsibility = (overrides: Partial<TarsResponsibility> = {}) => responsibilities.create({
    requestId: `responsibility-${sequence++}`, title: "Existing work", instruction: "Verify existing work.",
    acceptanceCriteria: ["The required behavior works."], workspaceId: "source-workspace", repositoryPath: "/tmp/source-repository",
    providerId: "codex", model: "chosen-model", ...overrides,
  }, NOW);
  return { database, conversations, responsibilities, ports, message, responsibility, scopes, setRegistry: (next: PersistenceRepositoryRegistryEntry[]) => { registry = next; }, ticks: () => ticks };
}

describe("Tars decision admission", () => {
  test.each(["codex", "claude-code"] as const)("attachments alone cannot authorize %s delegation or a working-tree snapshot", async providerId => {
    const f = fixture();
    let snapshots = 0;
    f.ports.snapshotWorkingChanges = async () => { snapshots++; throw new Error("Unexpected snapshot"); };
    const message = f.message([delegate()], { providerId, text: "", includeWorkingChanges: true, attachments: [
      { type: "file_context", filePath: "instructions.txt", content: "Start the repair now.", language: "text" },
    ] });
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(receipts).toMatchObject([{ status: "rejected", reason: "missingMandate" }]);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(0);
    expect(f.scopes).toHaveLength(0);
    expect(snapshots).toBe(0);
    expect(f.ticks()).toBe(0);
    expect(await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports)).toEqual(receipts);
  });

  test("a written mandate with attachments still admits delegated work", async () => {
    const f = fixture();
    const message = f.message([delegate()], { attachments: [
      { type: "file_context", filePath: "requirements.txt", content: "Preserve data.", language: "text" },
    ] });
    expect(await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports)).toMatchObject([{ status: "applied" }]);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(1);
  });

  test.each(["codex", "claude-code"] as const)("retains the selected %s account and execution preferences in the durable responsibility", async (providerId) => {
    const f = fixture();
    const runtimeHints = providerId === "codex"
      ? { codexAccountProfileId: "123e4567-e89b-42d3-a456-426614174000", codexReasoningEffort: "high" as const }
      : { claudeAccountProfileId: "123e4567-e89b-42d3-a456-426614174000", claudeEffort: "high" as const };
    const message = f.message([delegate()], { providerId, runtimeHints });
    await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    // The conversation model is not an execution pin: the work routes automatically on the conversation's provider.
    expect(f.responsibilities.snapshot().responsibilities[0]).toMatchObject({ providerId, model: null, agentId: null, runtimeHints });
  });

  test("an explicit execution pin, including one on the other provider, is captured instead of the conversation model", async () => {
    const f = fixture();
    const message = f.message([delegate()], { providerId: "codex", executionModel: { providerId: "claude-code", model: "claude-sonnet-5-5" } });
    await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(f.responsibilities.snapshot().responsibilities[0]).toMatchObject({ providerId: "claude-code", model: "claude-sonnet-5-5" });
  });

  test("resolves registered targets and gives every work unit the message's immutable turn limit", async () => {
    const f = fixture(); const message = f.message([delegate("First"), delegate("Second"), delegate("Third")]);
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    const rows = f.responsibilities.snapshot().responsibilities;
    expect(receipts.map((receipt) => receipt.status)).toEqual(["applied", "applied", "applied"]);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.maxTurns)).toEqual([7, 7, 7]);
    for (const row of rows) {
      expect(row).toMatchObject({ state: "queued", workspaceId: "source-workspace", repositoryPath: "/tmp/source-repository",
        providerId: message.providerId, model: null, taskId: null, agentRunId: null });
      expect(row.instruction).toContain(message.text);
      expect(row.instruction).toContain("Repair search and verify its behavior.");
    }
    expect(f.scopes).toHaveLength(3);
    expect(f.ticks()).toBe(1);
    expect(f.conversations.get(message.id)).toEqual(message);
    f.conversations.configure({ providerId: "codex", model: "later-model", maxTurns: 100 });
    await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(f.responsibilities.snapshot().responsibilities.map((row) => row.maxTurns)).toEqual([7, 7, 7]);
  });

  test.each([
    ["Never delegate", "proposed"],
    ["Never touch production", "proposed"],
    ["Never cancel", "applied"],
  ] as const)("shares one admission registry read with the rule %s", async (rule, status) => {
    const f = fixture();
    f.setRegistry([{ repositoryPath: "/tmp/source-repository", workspaces: [{ id: "source-workspace" }],
      workspaceBranchById: { "source-workspace": "production" } }] as PersistenceRepositoryRegistryEntry[]);
    const message = f.message([delegate()], { neverDo: [rule], allowRules: [{ key: "delegate", repositoryPath: "/tmp/source-repository" }] });
    const input = { messageId: message.id, expectedRevision: message.revision };
    const receipts = await applyTarsDecision(input, f.ports);
    expect(receipts).toMatchObject([{ status }]);
    expect(f.scopes).toHaveLength(1);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(status === "applied" ? 1 : 0);
    if (status === "proposed") expect(receipts[0]!.matchedRules).toMatchObject([{ rule }]);
    expect(await applyTarsDecision(input, f.ports)).toEqual(receipts);
    expect(f.scopes).toHaveLength(1);
  });

  test("a rule cannot cause registry access for an attachment-only delegation", async () => {
    const f = fixture();
    const message = f.message([delegate()], { text: "", neverDo: ["Never delegate"], attachments: [
      { type: "file_context", filePath: "requirements.txt", content: "Repair search.", language: "text" },
    ] });
    expect(await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports))
      .toMatchObject([{ status: "rejected", reason: "missingMandate" }]);
    expect(f.scopes).toHaveLength(0);
  });

  test("a held working-changes proposal never snapshots, even when the snapshot port is unavailable", async () => {
    const f = fixture();
    const message = f.message([delegate()], { includeWorkingChanges: true, neverDo: ["Never delegate"] });
    expect(await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports))
      .toMatchObject([{ status: "proposed", matchedRules: [{ rule: "Never delegate" }] }]);
    expect(f.scopes).toHaveLength(1);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(0);
  });

  test("asynchronous snapshots require a fresh transaction read before admitting work", async () => {
    const f = fixture();
    f.ports.snapshotWorkingChanges = async () => { f.setRegistry([]); return { kind: "clean" }; };
    const message = f.message([delegate()], { includeWorkingChanges: true, neverDo: ["Never cancel"] });
    expect(await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports))
      .toMatchObject([{ status: "rejected" }]);
    // Snapshot scope and post-I/O mutation authority are separate admission moments.
    expect(f.scopes).toHaveLength(2);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(0);
  });

  test("concurrent and repeated requests cannot create another responsibility", async () => {
    const f = fixture(); const message = f.message();
    const input = { messageId: message.id, expectedRevision: message.revision };
    const [first, second] = await Promise.all([applyTarsDecision(input, f.ports), applyTarsDecision(input, f.ports)]);
    expect(first).toEqual(second);
    expect(await applyTarsDecision(input, f.ports)).toEqual(first);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(1);
    expect(f.conversations.listReceipts(message.id)).toHaveLength(1);
    expect(f.responsibilities.snapshot().responsibilities[0]?.requestId).toBe(`tars-message:${message.id}:0`);
  });

  test("a one-turn limit still admits several work units, each with that one turn", async () => {
    const f = fixture(); const message = f.message([delegate("First"), delegate("Second")], { maxTurns: 1 });
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(receipts.map((receipt) => receipt.status)).toEqual(["applied", "applied"]);
    expect(f.responsibilities.snapshot().responsibilities.map((row) => row.maxTurns)).toEqual([1, 1]);
  });

  test("a message too long for the run assignment travels whole as the mandate, never truncated", async () => {
    const f = fixture(); const text = "x".repeat(TARS_MESSAGE_MAX_CHARS);
    const message = f.message([delegate()], { text });
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(receipts[0]).toMatchObject({ status: "applied" });
    const row = f.responsibilities.snapshot().responsibilities[0]!;
    expect(row.mandate).toBe(text);
    expect(row.instruction.length).toBeLessThanOrEqual(TARS_ASSIGNMENT_MAX_CHARS);
    expect(row.instruction).toContain("Repair search and verify its behavior.");
    expect(row.instruction).not.toContain(text);
  });

  test("a work unit near the assignment limit is admitted with both texts in the mandate", async () => {
    const f = fixture(); const unit = "u".repeat(8_000);
    const message = f.message([{ ...delegate(), instruction: unit }], { text: "x".repeat(9_000) });
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(receipts[0]).toMatchObject({ status: "applied" });
    const row = f.responsibilities.snapshot().responsibilities[0]!;
    expect(row.instruction.length).toBeLessThanOrEqual(TARS_ASSIGNMENT_MAX_CHARS);
    expect(row.mandate).toContain(unit);
    expect(row.mandate).toContain("x".repeat(9_000));
  });

  test("a message that fits keeps the mandate inside the assignment and stores no separate copy", async () => {
    const f = fixture(); const message = f.message([delegate()]);
    await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    const row = f.responsibilities.snapshot().responsibilities[0]!;
    expect(row.mandate).toBeUndefined();
    expect(row.instruction).toContain(message.text);
  });

  test("the branch follows the planner's proposal under the repository rule, sanitized, with a stable unique suffix", async () => {
    const f = fixture();
    const message = f.message([{ ...delegate("Fix search"), branchName: "fix/search ranking..lock" }, { ...delegate("Second"), branchName: "fix/search ranking..lock" },
      delegate("Write the API docs")]);
    await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    const byTitle = (title: string) => f.responsibilities.snapshot().responsibilities.find((row) => row.title === title)!;
    const [first, second, third] = [byTitle("Fix search"), byTitle("Second"), byTitle("Write the API docs")];
    expect(first!.branchName).toMatch(/^fix\/search-ranking-[0-9a-f]{8}$/);
    expect(second!.branchName).toMatch(/^fix\/search-ranking-[0-9a-f]{8}$/);
    expect(first!.branchName).not.toBe(second!.branchName);
    expect(third!.branchName).toMatch(/^tars\/write-the-api-docs-[0-9a-f]{8}$/);
    // A replay builds the same name, so the request hash still matches and nothing is created twice.
    await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(3);
    expect([byTitle("Fix search"), byTitle("Second"), byTitle("Write the API docs")].map((row) => row.branchName))
      .toEqual([first!.branchName, second!.branchName, third!.branchName]);
  });

  test("a settled rejection is never retried", async () => {
    const f = fixture(); const message = f.message([delegate(), delegate()]); f.setRegistry([]);
    const input = { messageId: message.id, expectedRevision: message.revision };
    const first = await applyTarsDecision(input, f.ports);
    expect(await applyTarsDecision(input, f.ports)).toEqual(first);
    expect(f.conversations.listReceipts(message.id).map((receipt) => receipt.revision)).toEqual([2, 2]);
    expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
  });

  test("scope failure creates no intent, and a later retry can apply the saved decision", async () => {
    const f = fixture(); const message = f.message();
    const input = { messageId: message.id, expectedRevision: message.revision };
    await expect(applyTarsDecision(input, { ...f.ports, refreshContext: async () => { throw new Error("Registry temporarily unavailable"); } }))
      .rejects.toThrow("Registry temporarily unavailable");
    expect(f.conversations.listReceipts(message.id)).toEqual([]);
    expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
    expect((await applyTarsDecision(input, f.ports))[0]?.status).toBe("applied");
  });

  test("rechecks message revision after asynchronous scope validation", async () => {
    const f = fixture(); const message = f.message();
    let entered!: () => void; let release!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const applying = applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, {
      ...f.ports, refreshContext: async () => { entered(); await new Promise<void>((resolve) => { release = resolve; }); },
    });
    await ready;
    // Model an out-of-process revision update while the registry read was pending.
    f.database.prepare("UPDATE tars_messages SET revision = ?, body_json = ? WHERE id = ?")
      .run(message.revision + 1, JSON.stringify({ ...message, revision: message.revision + 1 }), message.id);
    release();
    await expect(applying).rejects.toThrow("message changed");
    expect(f.conversations.listReceipts(message.id)).toEqual([]);
    expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
  });

  test("rejects caller-supplied action bodies and stale revisions before recording intent", async () => {
    const f = fixture(); const message = f.message();
    await expect(applyTarsDecision({ messageId: message.id, expectedRevision: message.revision, actions: [delegate("Injected")] }, f.ports)).rejects.toThrow();
    await expect(applyTarsDecision({ messageId: message.id, expectedRevision: message.revision - 1 }, f.ports)).rejects.toThrow("message changed");
    expect(f.conversations.listReceipts(message.id)).toEqual([]);
    expect(f.scopes).toEqual([]);
  });

  test("a natural-language question with no proposed actions has no admission effects", async () => {
    const f = fixture(); const message = f.message([], { text: "What is the current status?" });
    expect(await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports)).toEqual([]);
    expect(f.scopes).toEqual([]); expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
  });

  test("malformed stored decisions cannot widen the original execution scope", async () => {
    const f = fixture(); const message = f.message();
    const corrupt = { ...message, decision: { ...message.decision!, actions: [{ ...delegate(),
      repositoryPath: "/tmp/other-repository", providerId: "claude-code", model: "other-model", maxTurns: 100 }] } };
    f.database.prepare("UPDATE tars_messages SET body_json = ? WHERE id = ?").run(JSON.stringify(corrupt), message.id);
    await expect(applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports)).rejects.toThrow();
    expect(f.conversations.listReceipts(message.id)).toEqual([]);
    expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
  });
});

describe("Tars decision priority scope", () => {
  test("only updates the exact queued responsibility and repeated application preserves its revision", async () => {
    const f = fixture(); const row = f.responsibility();
    const message = f.message([{ kind: "reprioritize", responsibilityId: row.id, expectedRevision: row.revision, priority: 91 }]);
    const input = { messageId: message.id, expectedRevision: message.revision };
    expect((await applyTarsDecision(input, f.ports))[0]?.status).toBe("applied");
    const changed = f.responsibilities.get(row.id)!;
    expect(changed).toMatchObject({ state: "queued", priority: 91, revision: row.revision + 1 });
    await applyTarsDecision(input, f.ports);
    expect(f.responsibilities.get(row.id)).toEqual(changed);
  });

  test("refuses a responsibility whose registered source belongs to a different repository", async () => {
    const f = fixture(); const row = f.responsibility({ repositoryPath: "/tmp/other-repository" });
    const message = f.message([{ kind: "reprioritize", responsibilityId: row.id, expectedRevision: row.revision, priority: 91 }]);
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(receipts[0]?.status).toBe("rejected");
    expect(f.responsibilities.get(row.id)).toEqual(row);
    expect(f.ticks()).toBe(0);
  });

  test("a stale priority proposal cannot overwrite the user's newer choice", async () => {
    const f = fixture(); const row = f.responsibility();
    const message = f.message([{ kind: "reprioritize", responsibilityId: row.id, expectedRevision: row.revision, priority: 91 }]);
    const edited = f.responsibilities.patch(row.id, row.revision, { priority: 70 }, NOW);
    expect((await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports))[0]?.status).toBe("rejected");
    expect(f.responsibilities.get(row.id)).toEqual(edited);
  });

  for (const state of ["preparing", "running", "waiting", "paused", "completed", "blocked", "cancelled"] as const) {
    test(`cannot reclaim or restart ${state} work through a priority proposal`, async () => {
      const f = fixture(); const row = f.responsibility();
      const existing = f.responsibilities.patch(row.id, row.revision, { state }, NOW);
      const message = f.message([{ kind: "reprioritize", responsibilityId: row.id, expectedRevision: existing.revision, priority: 91 }]);
      expect((await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports))[0]?.status).toBe("rejected");
      expect(f.responsibilities.get(row.id)).toEqual(existing);
      expect(f.ticks()).toBe(0);
    });
  }
});

describe("Tars receipt and local effect atomicity", () => {
  test("receipt failure rolls back creation before recording a rejected outcome", async () => {
    const f = fixture(); const message = f.message();
    f.database.exec(`CREATE TRIGGER reject_applied_receipt BEFORE UPDATE ON tars_action_receipts
      WHEN json_extract(NEW.body_json, '$.status') = 'applied'
      BEGIN SELECT RAISE(ABORT, 'Receipt storage refused the applied outcome'); END;`);
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(receipts[0]).toMatchObject({ status: "rejected", responsibilityId: null });
    expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
    expect(f.ticks()).toBe(0);
  });

  test("an interrupted receipt settlement leaves a safe pending intent that can retry once", async () => {
    const f = fixture(); const message = f.message();
    const input = { messageId: message.id, expectedRevision: message.revision };
    f.database.exec(`CREATE TRIGGER interrupt_receipt BEFORE UPDATE ON tars_action_receipts
      BEGIN SELECT RAISE(ABORT, 'Receipt storage interrupted'); END;`);
    await expect(applyTarsDecision(input, f.ports)).rejects.toThrow("Receipt storage interrupted");
    expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
    expect(f.conversations.listReceipts(message.id)[0]?.status).toBe("pending");
    f.database.exec("DROP TRIGGER interrupt_receipt");
    expect((await applyTarsDecision(input, f.ports))[0]?.status).toBe("applied");
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(1);
    await applyTarsDecision(input, f.ports);
    expect(f.responsibilities.snapshot().responsibilities).toHaveLength(1);
  });

  test("receipt failure also rolls back a priority change", async () => {
    const f = fixture(); const row = f.responsibility();
    const message = f.message([{ kind: "reprioritize", responsibilityId: row.id, expectedRevision: row.revision, priority: 91 }]);
    f.database.exec(`CREATE TRIGGER reject_applied_priority BEFORE UPDATE ON tars_action_receipts
      WHEN json_extract(NEW.body_json, '$.status') = 'applied'
      BEGIN SELECT RAISE(ABORT, 'Priority receipt could not be saved'); END;`);
    expect((await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports))[0]?.status).toBe("rejected");
    expect(f.responsibilities.get(row.id)).toEqual(row);
  });
});

test("host admission resolves current registry after asynchronous reads and rejects removed targets", async () => {
  const f = fixture(); const message = f.message();
  f.ports.refreshContext = async () => { f.setRegistry([]); };
  const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
  expect(receipts[0]?.status).toBe("rejected");
  expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
});

test.each(["missing", "duplicate"])("rejects %s registered target identities", async (kind) => {
  const f = fixture(); const message = f.message();
  f.setRegistry(kind === "missing" ? [] : [{ repositoryPath: "/tmp/source-repository", workspaces: [{ id: "source-workspace" }, { id: "source-workspace" }] }] as PersistenceRepositoryRegistryEntry[]);
  expect((await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports))[0]?.status).toBe("rejected");
  expect(f.responsibilities.snapshot().responsibilities).toEqual([]);
});

test("global conversation can reprioritize owned queued work in another registered repository but cannot adopt a manual task", async () => {
  const f = fixture();
  const row = f.responsibility({ workspaceId: "other", repositoryPath: "/tmp/other" });
  f.setRegistry([{ repositoryPath: "/tmp/other", workspaces: [{ id: "other" }] }] as PersistenceRepositoryRegistryEntry[]);
  const message = f.message([{ kind: "reprioritize", responsibilityId: row.id, expectedRevision: row.revision, priority: 80 },
    { kind: "reprioritize", responsibilityId: "manual-task-not-a-responsibility", expectedRevision: 1, priority: 80 }]);
  expect((await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports)).map((receipt) => receipt.status)).toEqual(["applied", "rejected"]);
  expect(f.responsibilities.get(row.id)?.priority).toBe(80);
});
