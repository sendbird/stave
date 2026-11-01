import { expect, test } from "bun:test";
import { freezeAdaptivePolicy } from "../electron/host-service/supervision/adaptive-policy";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import { selectAdaptiveRoute } from "../src/lib/agent-runs/adaptive-route";
import { createAgentRun, type AgentRunEvent } from "../src/lib/agent-runs/domain";
import { buildAgentRunStartInput } from "../src/lib/agent-runs/agent-run";
import { buildStarterProfile, resolveRoute } from "../src/lib/providers/auto-routing-profile";

const now = new Date("2026-11-01T00:00:00Z");
function fixture(providerId: "codex" | "claude-code", taskClass: "implement" | "review") {
  const [model, light] = providerId === "codex" ? ["gpt-6.1-sol", "gpt-6-luna"] : ["claude-opus-5-5", "claude-haiku-5-5"];
  const policy = freezeAdaptivePolicy({ providerId, model: model!, agent: { ...getBuiltinAgent("builder")!, model: { mode: "auto" } }, settings: null, maxTurns: 30, draft: { autoRouting: true } });
  const created = createAgentRun({ id: "r", input: buildAgentRunStartInput({ workspaceId: "ws", taskId: "t", agent: { name: "Agent" }, assignment: "Verify", now }), repositoryPath: "/tmp/repo", fingerprint: { providerId, model: model! }, now });
  const aggregate = { agentRun: { ...created.agentRun, turnCount: 3 }, stages: created.upserts };
  const event = (sequence: number, kind: AgentRunEvent["kind"], detail: Record<string, unknown>): AgentRunEvent => ({ id: `e${sequence}`, agentRunId: "r", sequence, kind, detail, createdAt: now.toISOString(), idempotencyKey: `k${sequence}` });
  const linked = event(1, "turn-linked", { stageId: "work", attempt: 1, turnId: "t1" });
  const ask = (reason = "mechanical-step", requested = light!) => event(2, "resource-request", { stageId: "work", attempt: 1, request: { model: requested, effort: "medium", reason, rationale: "Remaining step", evidenceRefs: ["t1"] } });
  const route = resolveRoute({ profile: buildStarterProfile("starter-quality-first"), role: "primary", signals: { currentProviderId: providerId, taskClass, complexity: "low", sensitive: false, fileContextCount: 0, providerAvailability: { codex: providerId === "codex", "claude-code": providerId === "claude-code", cursor: false, kiro: false } } });
  const automatic = { model: route.model, effort: "medium", rationale: route.reason, minimumTier: "balanced" as const };
  return { policy, aggregate, event, linked, ask, automatic, light: light!, model: model! };
}

for (const providerId of ["codex", "claude-code"] as const) for (const taskClass of ["implement", "review"] as const) {
  test(`${providerId} ${taskClass}: the final adaptive route keeps the quality floor`, () => {
    const f = fixture(providerId, taskClass);
    for (const reason of ["mechanical-step", "capability-mismatch", "user-request"]) {
      const selected = selectAdaptiveRoute(f.policy, f.aggregate, [f.linked, f.ask(reason)], null, f.automatic);
      expect(selected.model).not.toBe(f.light);
      expect(selected.decision?.accepted).toBe(false);
    }
    // A mechanical step can still use the Standard level's balanced rung.
    const balanced = providerId === "codex" ? "gpt-6.1-terra" : "claude-sonnet-5-5";
    expect(selectAdaptiveRoute(f.policy, f.aggregate, [f.linked, f.ask("mechanical-step", balanced)], null, f.automatic).model).toBe(balanced);
  });
}

test("a saved light route is repaired despite cooldown, change limit and an old pending request", () => {
  const f = fixture("codex", "implement");
  const saved = [f.linked, ...[2, 3].map((sequence) => f.event(sequence, "resource-decision", { accepted: true, automatic: true, turnCount: 3, linkedTurnCount: 1, model: f.light, effort: "medium" }))];
  const chosen = selectAdaptiveRoute(f.policy, f.aggregate, saved, null, f.automatic);
  expect(chosen.model).toBe(f.automatic.model);
  expect(chosen.decision).toMatchObject({ accepted: true, automatic: true, model: f.automatic.model });
  const replay = selectAdaptiveRoute(f.policy, f.aggregate, [...saved, f.event(4, "resource-decision", chosen.decision!)], null, f.automatic);
  expect(replay.model).toBe(f.automatic.model);
  expect(replay.decision?.accepted).toBe(false);
  const pending = selectAdaptiveRoute(f.policy, f.aggregate, [...saved, { ...f.ask(), sequence: 4 }], null, f.automatic);
  expect(pending.model).toBe(f.automatic.model);
});

test("model pins are explicit exceptions; an effort pin cannot weaken the model floor", () => {
  const f = fixture("codex", "implement");
  expect(selectAdaptiveRoute(f.policy, f.aggregate, [f.linked], null, f.automatic, { modelPinned: true, effortPinned: false, model: f.light }).model).toBe(f.light);
  expect(selectAdaptiveRoute({ ...f.policy, modelLocked: true }, f.aggregate, [f.linked], null, f.automatic).model).toBe(f.model);
  const weak = { ...f.policy, allowedModels: [f.light, f.model] };
  const selected = selectAdaptiveRoute(weak, f.aggregate, [], null, f.automatic, { modelPinned: false, effortPinned: true, effort: "high" });
  expect(selected).toMatchObject({ model: f.model, effort: "high" });
  expect(() => selectAdaptiveRoute(weak, f.aggregate, [], [{ model: f.light }], f.automatic)).toThrow();
  const unsupported = [{ model: f.light }, { model: f.model, supportedEfforts: ["low"] }];
  expect(() => selectAdaptiveRoute(weak, f.aggregate, [], unsupported, f.automatic, { modelPinned: false, effortPinned: true, effort: "high" })).toThrow("pinned effort");
});

test("without a minimum tier, other Auto preferences retain mechanical adaptation", () => {
  const f = fixture("codex", "implement");
  const { minimumTier: _floor, ...automatic } = f.automatic;
  expect(selectAdaptiveRoute(f.policy, f.aggregate, [f.linked, f.ask()], null, automatic).model).toBe(f.light);
});

test("a host-admitted reply without composer settings retains the floor until Auto is explicitly replaced", () => {
  const f = fixture("codex", "implement");
  const first = selectAdaptiveRoute(f.policy, f.aggregate, [f.linked], null, f.automatic);
  const saved = [f.linked, f.event(2, "resource-decision", first.decision!)];
  const pending = { ...f.ask(), sequence: 3 };
  expect(selectAdaptiveRoute(f.policy, f.aggregate, [...saved, pending]).model).toBe(f.model);
  const cleared = selectAdaptiveRoute(f.policy, f.aggregate, saved, null, undefined, { modelPinned: false, effortPinned: false });
  expect(cleared.decision).toMatchObject({ minimumTier: null });
  const resumed = [...saved, f.event(3, "resource-decision", cleared.decision!),
    f.event(4, "turn-linked", { stageId: "work", attempt: 1, turnId: "t2" }), f.event(5, "turn-linked", { stageId: "work", attempt: 1, turnId: "t3" }), { ...pending, sequence: 6 }];
  expect(selectAdaptiveRoute(f.policy, f.aggregate, resumed).model).toBe(f.light);
});
