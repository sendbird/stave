import { expect, test } from "bun:test";
import { routeTarsExecution } from "../electron/host-service/tars-execution-routing";
import { emptyRateLimitsSnapshot } from "../src/lib/providers/account-usage-block";
const now = Date.parse("2026-11-18T00:00:00Z");
const account = "123e4567-e89b-42d3-a456-426614174000";
function snapshot(claude: number | null, codex: number | null) {
  const value = emptyRateLimitsSnapshot();
  if (claude !== null) value.claude = { ...value.claude, source: "oauth", session: { usedPercent: claude, resetsAt: now / 1000 + 3600 } };
  if (codex !== null) value.codex = { ...value.codex, source: "rpc", buckets: [{ limitId: "codex", limitName: null, planType: null, primary: { usedPercent: codex, resetsAt: now / 1000 + 3600, windowDurationMins: 300 }, secondary: null, individualLimit: null, credits: null }] };
  return value;
}
for (const [claude, codex, selected] of [[94, 20, "codex"], [100, 20, "codex"], [75, 20, "codex"], [20, 30, "claude-code"], [100, null, "claude-code"], [null, 20, "codex"], [94, 94, "claude-code"]] as const) {
  test(`Automatic routes ${claude}/${codex} to ${selected}`, async () => {
    let captured: unknown;
    const route = await routeTarsExecution({ providerId: "claude-code", runtimeHints: { claudeAccountProfileId: account } }, {
      now: () => now, read: async accounts => { captured = accounts; return snapshot(claude, codex); },
    });
    expect(route.providerId).toBe(selected);
    expect(route.model).toBeNull();
    expect(captured).toEqual({ claudeAccountProfileId: account, codexAccountProfileId: "system-default" });
    expect(route.runtimeHints.claudeAccountProfileId).toBe(account);
  });
}
test("explicit model and fixed-agent provider survive quota pressure; failed reads do not invent headroom", async () => {
  const message = { providerId: "claude-code" as const, executionModel: { providerId: "claude-code" as const, model: "claude-sonnet-5-5" } };
  const ports = { now: () => now, read: async () => snapshot(100, 20) };
  expect(await routeTarsExecution(message, ports)).toMatchObject({ providerId: "claude-code", model: "claude-sonnet-5-5" });
  expect(await routeTarsExecution({ providerId: "claude-code" }, { ...ports, keepProvider: true })).toMatchObject({ providerId: "claude-code" });
  expect(await routeTarsExecution({ providerId: "claude-code" }, { read: async () => { throw new Error("unavailable"); } })).toMatchObject({ providerId: "claude-code" });
});

test("all work units in one decision share the same fresh account read", async () => {
  const { createTarsExecutionRouter } = await import("../electron/host-service/tars-execution-routing");
  let reads = 0;
  const route = createTarsExecutionRouter({ fixedAgent: () => false, read: async () => { reads++; return snapshot(94, 20); } });
  await Promise.all([route({ providerId: "claude-code" }), route({ providerId: "claude-code" })]);
  expect(reads).toBe(1);
});

test("decision admission persists the selected provider and both captured accounts", async () => {
  const { Database } = await import("bun:sqlite");
  const { TarsStore } = await import("../electron/persistence/tars-store");
  const { TarsConversationStore } = await import("../electron/persistence/tars-conversation-store");
  const { applyTarsDecision } = await import("../electron/host-service/tars-decisions");
  const db = new Database(":memory:");
  try {
    const conversations = new TarsConversationStore(db), responsibilities = new TarsStore(db);
    conversations.configure({ providerId: "claude-code", model: "claude-sonnet-5-5", maxTurns: 20, runtimeHints: { claudeAccountProfileId: account } });
    const queued = conversations.create({ requestId: "routing-admission", text: "Fix search" }, new Date(now).toISOString());
    const claimed = conversations.claim(queued.id, queued.revision, new Date(now).toISOString());
    const message = conversations.answer(claimed.id, claimed.revision, { reply: "Starting", actions: [{ kind: "delegate", workspaceId: "source", title: "Fix", instruction: "Fix search", acceptanceCriteria: ["Works"], priority: 50 }] }, new Date(now).toISOString());
    const receipts = await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, {
      conversations, responsibilities, requestTick: () => {},
      readRegistry: () => [{ repositoryPath: "/tmp/project", workspaces: [{ id: "source" }] }] as never,
      control: async () => { throw new Error("not a control"); },
      routeExecution: value => routeTarsExecution(value, { now: () => now, read: async () => snapshot(94, 20) }),
    });
    expect(receipts[0]?.status).toBe("applied");
    expect(responsibilities.snapshot().responsibilities[0]).toMatchObject({ providerId: "codex", model: null,
      runtimeHints: { claudeAccountProfileId: account, codexAccountProfileId: "system-default" } });
  } finally { db.close(); }
});
