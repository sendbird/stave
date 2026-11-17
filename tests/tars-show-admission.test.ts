import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { applyTarsDecision, type TarsDecisionPorts } from "../electron/host-service/tars-decisions";
import { parseTarsDecisionOutput } from "../electron/main/tars-planner";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import type { PersistenceRepositoryRegistryEntry } from "../electron/persistence/types";
import type { TarsDecisionAction } from "../src/lib/tars/conversation";

const NOW = "2026-11-05T00:00:00.000Z";
const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function fixture() {
  const database = new Database(":memory:"); databases.push(database);
  const conversations = new TarsConversationStore(database);
  const responsibilities = new TarsStore(database);
  let ticks = 0;
  let sequence = 0;
  const registry = [{ repositoryPath: "/tmp/source-repository", workspaces: [{ id: "source-workspace" }] }] as PersistenceRepositoryRegistryEntry[];
  const ports: TarsDecisionPorts = { conversations, responsibilities, now: () => NOW, readRegistry: () => registry, requestTick: () => { ticks++; } };
  const message = (actions: TarsDecisionAction[]) => {
    conversations.configure({ providerId: "codex", model: "chosen-model", maxTurns: 7 });
    const queued = conversations.create({ requestId: `message-${sequence++}`, text: "Show me the report." }, NOW);
    const claimed = conversations.claim(queued.id, queued.revision, NOW);
    return conversations.answer(claimed.id, claimed.revision, { reply: "Here it is.", actions }, NOW);
  };
  const responsibility = () => responsibilities.create({ requestId: `responsibility-${sequence++}`, title: "Existing work", instruction: "Verify existing work.",
    acceptanceCriteria: ["The required behavior works."], workspaceId: "source-workspace", repositoryPath: "/tmp/source-repository", providerId: "codex", model: "chosen-model" }, NOW);
  return { conversations, responsibilities, ports, message, responsibility, ticks: () => ticks };
}

describe("show admission", () => {
  test("opens a view of the user's Tars work: its receipt says opened and nothing about the work changes", async () => {
    const f = fixture(); const row = f.responsibility();
    const message = f.message([{ kind: "show", responsibilityId: row.id, view: "report" }]);
    const [receipt] = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(receipt).toMatchObject({ status: "applied", responsibilityId: row.id, error: null, reason: null });
    expect(f.responsibilities.get(row.id)).toEqual(row);
    // A view wakes no work queue.
    expect(f.ticks()).toBe(0);
    // Applying again is the same receipt, once.
    const [again] = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(again).toEqual(receipt);
  });

  test("is refused for a responsibility that is not the user's Tars work", async () => {
    const f = fixture();
    const message = f.message([{ kind: "show", responsibilityId: "manual-task", view: "changes" }]);
    const [receipt] = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, f.ports);
    expect(receipt).toMatchObject({ status: "rejected", responsibilityId: null, reason: "notOwned" });
  });

  test("model output naming a show is validated strictly like any action", () => {
    expect(parseTarsDecisionOutput(JSON.stringify({ reply: "Opened.", actions: [{ kind: "show", responsibilityId: "r1", view: "timeline" }] })).actions)
      .toEqual([{ kind: "show", responsibilityId: "r1", view: "timeline" }]);
    for (const bad of [{ kind: "show", responsibilityId: "r1", view: "timeline", operation: "resume" }, { kind: "show", responsibilityId: "r1", view: "files" }])
      expect(parseTarsDecisionOutput(JSON.stringify({ reply: "Opened.", actions: [bad] }))).toMatchObject({ reply: "Opened.", actions: [], dropped: [{ index: 0, kind: "show", reason: "invalid" }] });
  });
});
