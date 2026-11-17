import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { TarsStore } from "../electron/persistence/tars-store";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { buildTarsPlannerPrompt, parseTarsDecisionOutput } from "../electron/main/tars-planner";
import { TarsActionReceiptSchema, type TarsDecisionAction } from "../src/lib/tars/conversation";
import { TarsOpenActionSchema, selectNewTarsOpenRequests } from "../src/lib/tars/open";
import { SETTINGS, REGISTRY, testContext } from "./tars-test-context";

const NOW = "2026-11-12T12:00:00.000Z";

test("open is strict and the planner's per-action reader preserves only valid navigation", () => {
  const valid = [
    { kind: "open", target: "task", id: "task" }, { kind: "open", target: "workspace", id: "source" },
    { kind: "open", target: "fleet" }, { kind: "open", target: "activity" },
  ];
  for (const action of valid) {
    expect(TarsOpenActionSchema.parse(action)).toEqual(action);
    expect(parseTarsDecisionOutput(JSON.stringify({ reply: "Opening", actions: [action] })).actions).toEqual([action]);
  }
  const invalid = [ { kind: "open", target: "task" }, { kind: "open", target: "workspace", id: " " },
    { kind: "open", target: "fleet", id: "task" }, { kind: "open", target: "activity", command: "run" },
    { kind: "open", target: "settings" }, { kind: "open", target: "task", id: "task", authority: true } ];
  for (const action of invalid) {
    expect(TarsOpenActionSchema.safeParse(action).success).toBe(false);
    expect(parseTarsDecisionOutput(JSON.stringify({ reply: "Opening", actions: [action] })).dropped?.[0]).toMatchObject({ kind: "open", reason: "invalid" });
  }
  const parsed = parseTarsDecisionOutput(JSON.stringify({ reply: "Opening", actions: [valid[2], valid[3]] }));
  expect(parsed.actions).toHaveLength(1);
  expect(parsed.dropped?.[0]?.reason).toBe("overLimit");
});

test("host immediately admits known screens, refuses unknown/ambiguous ids, records once and never wakes work", async () => {
  const database = new Database(":memory:");
  try {
    const conversations = new TarsConversationStore(database);
    conversations.configure({ ...SETTINGS, autonomy: "careful", neverDo: ["Never start new work"] });
    const responsibilities = new TarsStore(database);
    const row = responsibilities.create({ requestId: "work", title: "Search", instruction: "Fix search", acceptanceCriteria: ["Works"], workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, NOW);
    responsibilities.patch(row.id, row.revision, { taskId: "task", executionWorkspaceId: "source" }, NOW);
    let ticks = 0;
    let registry = REGISTRY;
    const actions: TarsDecisionAction[] = [ { kind: "open", target: "task", id: "task" }, { kind: "open", target: "workspace", id: "source" },
      { kind: "open", target: "fleet" }, { kind: "open", target: "activity" }, { kind: "open", target: "task", id: "foreign" }, { kind: "open", target: "workspace", id: "foreign" } ];
    // Separate saved replies follow the planner's one-navigation-per-reply limit.
    const saved = actions.map((action, index) => {
      const queued = conversations.create({ requestId: `message-${index}`, text: "Open the screen" }, NOW);
      const claimed = conversations.claim(queued.id, queued.revision, NOW);
      return conversations.answer(claimed.id, claimed.revision, { reply: "Opening", actions: [action] }, NOW);
    });
    const ports = { conversations, responsibilities, readRegistry: () => registry, requestTick: () => { ticks++; },
      control: async () => { throw new Error("Navigation reached execution"); }, now: () => NOW };
    const receipts = [];
    for (const message of saved) {
      const input = { messageId: message.id, expectedRevision: message.revision };
      const result = await applyTarsDecision(input, ports);
      expect(await applyTarsDecision(input, ports)).toEqual(result);
      receipts.push(result[0]!);
      expect(TarsActionReceiptSchema.safeParse(result[0]).success).toBe(true);
    }
    expect(receipts.map(receipt => receipt.status)).toEqual(["applied", "applied", "applied", "applied", "rejected", "rejected"]);
    expect(receipts.every(receipt => receipt.responsibilityId === null)).toBe(true);
    expect(ticks).toBe(0);
    expect(responsibilities.get(row.id)?.revision).toBe(2);
    const prompt = buildTarsPlannerPrompt(saved[0]!, testContext(responsibilities), []);
    expect(prompt).toContain("kind:'open'");
    expect(prompt).toContain("task'|'workspace'|'fleet'|'activity");
    expect(prompt).toContain("Unknown or ambiguous ids are refused");
    const baseline = selectNewTarsOpenRequests(receipts, null);
    expect(baseline.requests).toEqual([]);
    const incoming = selectNewTarsOpenRequests(receipts, new Set());
    expect(incoming.requests).toHaveLength(4);
    expect(selectNewTarsOpenRequests(receipts, incoming.seen).requests).toEqual([]);
    registry = [...REGISTRY, ...REGISTRY];
    const queued = conversations.create({ requestId: "ambiguous", text: "Open source" }, NOW);
    const claimed = conversations.claim(queued.id, queued.revision, NOW);
    const message = conversations.answer(claimed.id, claimed.revision, { reply: "Opening", actions: [actions[1]!] }, NOW);
    expect((await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, ports))[0]).toMatchObject({ status: "rejected", reason: "notOwned" });
  } finally { database.close(); }
});
