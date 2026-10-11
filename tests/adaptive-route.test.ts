import { expect, test } from "bun:test";
import { freezeAdaptivePolicy } from "../electron/host-service/supervision/adaptive-policy";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import { readAdaptiveObservations, rememberAdaptiveCatalog, rememberAdaptiveQuota } from "../electron/providers/adaptive-observations";
import { emptyRateLimitsSnapshot } from "../src/lib/providers/account-usage-block";
import { constrainHelperResources, supportsAdaptiveEffort } from "../src/lib/agent-runs/resources";
import { selectAdaptiveRoute } from "../src/lib/agent-runs/adaptive-route";
import { createAgentRun, type AgentRunEvent } from "../src/lib/agent-runs/domain";
import { buildAgentRunStartInput } from "../src/lib/agent-runs/agent-run";

const now = new Date("2026-10-09T00:00:00Z");
const policy = freezeAdaptivePolicy({ providerId: "codex", model: "gpt-6.1-sol", agent: { ...getBuiltinAgent("builder")!, model: { mode: "auto" } },
  settings: null, maxTurns: 30, draft: { autoRouting: true } });
function aggregate(turnCount = 1) {
  const change = createAgentRun({ id: "r", input: buildAgentRunStartInput({ workspaceId: "ws", taskId: "t", agent: { name: "Agent" }, assignment: "Verify", now }),
    repositoryPath: "/tmp/repo", fingerprint: { providerId: "codex", model: "gpt-6.1-sol" }, now });
  return { agentRun: { ...change.agentRun, turnCount }, stages: change.upserts };
}
function event(sequence: number, kind: AgentRunEvent["kind"], detail: Record<string, unknown>): AgentRunEvent {
  return { id: `e${sequence}`, agentRunId: "r", sequence, kind, detail, createdAt: now.toISOString(), idempotencyKey: `k${sequence}` };
}
const linked = event(1, "turn-linked", { stageId: "work", attempt: 1, turnId: "t1" });
const request = (sequence: number, model: string) => event(sequence, "resource-request", {
  stageId: "work", attempt: 1, request: { model, reason: "mechanical-step", rationale: "A bounded mechanical task remains", evidenceRefs: ["t1"] },
});
test("explicit model and effort pins are frozen without taking a caller authority field", () => {
  const p = freezeAdaptivePolicy({ providerId: "codex", model: "gpt-6.1-sol", agent: null, settings: null, maxTurns: 100,
    draft: { model: "gpt-6-astra", modelProviderId: "codex", codexReasoningEffort: "high" } });
  expect(p).toMatchObject({ allowedModels: ["gpt-6-astra"], modelLocked: true, effortLocked: true, initialEffort: "high", teamTurns: 30 });
});
test("the account selected when the Run was asked for wins over a draft pin and the request scope", () => {
  const selected = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
  const freeze = (accounts?: { claudeAccountProfileId?: string; codexAccountProfileId?: string }) =>
    freezeAdaptivePolicy({ providerId: "codex", model: "gpt-6.1-sol", agent: null, settings: null, maxTurns: 30,
      draft: { codexAccountProfileId: "draft-account" }, ...(accounts ? { accounts } : {}) });
  expect(freeze({ claudeAccountProfileId: "other", codexAccountProfileId: selected }).accountProfileId).toBe(selected);
  expect(freeze().accountProfileId).toBe("draft-account");
  expect(freezeAdaptivePolicy({ providerId: "codex", model: "gpt-6.1-sol", agent: null, settings: null, maxTurns: 30 }).accountProfileId)
    .toBe("system-default");
});
test("a change is rejected during cooldown, after two changes, or outside the cached eligible catalog", () => {
  const accepted = event(2, "resource-decision", { accepted: true, requestSequence: 2, turnCount: 1, model: "gpt-6-luna", effort: "medium" });
  const recent = selectAdaptiveRoute(policy, aggregate(2), [linked, accepted, request(3, "gpt-6.1-sol")]);
  expect(recent.decision).toMatchObject({ accepted: false, reason: "The two-turn cooldown is active." });
  const second = event(4, "resource-decision", { accepted: true, requestSequence: 3, turnCount: 3, model: "gpt-6.1-sol", effort: "medium" });
  expect(selectAdaptiveRoute(policy, aggregate(6), [linked, accepted, second, request(5, "gpt-6-luna")]).decision).toMatchObject({ accepted: false, reason: "The change limit is reached." });
  expect(selectAdaptiveRoute(policy, aggregate(4), [linked, request(3, "gpt-6-luna")], [{ model: "gpt-6.1-sol", supportedEfforts: [] }]).decision?.accepted).toBe(false);
});
test("catalog and quota facts are scoped to an account and expire after five minutes", () => {
  const time = now.getTime();
  rememberAdaptiveCatalog("adaptive-test-a", { providerId: "codex", ok: true, detail: "observed", models: [] }, time);
  expect(readAdaptiveObservations("codex", "adaptive-test-b", time).catalog).toBeNull();
  expect(readAdaptiveObservations("codex", "adaptive-test-a", time + 300_001).catalog).toBeNull();
  expect(readAdaptiveObservations("codex", "adaptive-test-a", time).catalog?.observedAt).toBe(now.toISOString());
  const snapshot = emptyRateLimitsSnapshot();
  const metadata = { observedAt: now.toISOString(), claudeAccountProfileId: "system-default", codexAccountProfileId: "system-default" };
  rememberAdaptiveQuota(snapshot, { ...metadata, providerId: "codex", accountProfileId: "observed-account" });
  rememberAdaptiveQuota(snapshot, { ...metadata, providerId: "claude-code", accountProfileId: "observed-account" });
  expect(readAdaptiveObservations("codex", "observed-account", time).quota?.metadata.providerId).toBe("codex");
  expect(readAdaptiveObservations("codex", "system-default", time).quota).toBeNull();
  expect(readAdaptiveObservations("codex", "observed-account", time + 300_001).quota).toBeNull();
});

test("a helper inherits the root account, eligible catalog and pins even after settings widen", () => {
  const root = { ...policy, allowedModels: ["gpt-6.1-sol"], modelLocked: true, effortLocked: true, accountProfileId: "root-account" };
  expect(constrainHelperResources(root, { ...policy, accountProfileId: "other-account" }, "gpt-6.1-sol"))
    .toMatchObject({ allowedModels: ["gpt-6.1-sol"], accountProfileId: "root-account", modelLocked: true, effortLocked: true });
  expect(() => constrainHelperResources(root, { ...policy, providerId: "claude-code" }, "gpt-6.1-sol")).toThrow("provider");
  expect(() => constrainHelperResources(root, policy, "gpt-6-luna")).toThrow("catalog");
});

test("a mechanical step cannot hide an effort escalation on the same model", () => {
  const requested = event(3, "resource-request", { stageId: "work", attempt: 1,
    request: { effort: "high", reason: "mechanical-step", rationale: "Small copy task", evidenceRefs: ["t1"] } });
  expect(selectAdaptiveRoute({ ...policy, initialEffort: "medium" }, aggregate(), [linked, requested]).decision)
    .toMatchObject({ accepted: false, reason: "A mechanical step cannot increase effort." });
});

test("a helper cannot silently clamp the root's locked effort on a smaller model", () => {
  const root = { ...policy, effortLocked: true, initialEffort: "ultra" };
  expect(() => constrainHelperResources(root, policy, "gpt-6-luna")).toThrow("effort pin");
});

test("a retired pinned effort is refused rather than silently raised at admission", () => {
  expect(() => freezeAdaptivePolicy({ providerId: "codex", model: "gpt-6.1-sol", agent: null, settings: null, maxTurns: 30,
    draft: { codexReasoningEffort: "minimal" } })).toThrow("pinned effort");
});

test("Codex admission refuses an in-scale effort unsupported by the pinned model", () => {
  expect(() => freezeAdaptivePolicy({ providerId: "codex", model: "gpt-6-luna", agent: null, settings: null, maxTurns: 30,
    draft: { model: "gpt-6-luna", codexReasoningEffort: "ultra" } })).toThrow("pinned effort");
});

test("a model-only downshift cannot carry unsupported effort from an earlier decision", () => {
  const accepted = event(2, "resource-decision", { accepted: true, requestSequence: 2, turnCount: 1, model: "gpt-6.1-sol", effort: "ultra" });
  const rejected = selectAdaptiveRoute(policy, aggregate(3), [linked, accepted, request(3, "gpt-6-luna")]);
  expect(rejected.decision).toMatchObject({ accepted: false, reason: "The model does not support that effort." });
  expect(rejected).toMatchObject({ model: "gpt-6.1-sol", effort: "ultra" });
  const compatible = event(4, "resource-request", { stageId: "work", attempt: 1,
    request: { model: "gpt-6-luna", effort: "max", reason: "mechanical-step", rationale: "Mechanical follow-through", evidenceRefs: ["t1"] } });
  expect(selectAdaptiveRoute(policy, aggregate(3), [linked, accepted, compatible]))
    .toMatchObject({ model: "gpt-6-luna", effort: "max", decision: { accepted: true } });
});

test("advertised model efforts override the static scale without silently changing pins", () => {
  const catalog = [{ model: "gpt-6.1-sol", supportedEfforts: ["medium", "high"] }];
  const proposal = event(3, "resource-request", { stageId: "work", attempt: 1,
    request: { effort: "ultra", reason: "capability-mismatch", rationale: "Need deeper reasoning", evidenceRefs: ["t1"] } });
  expect(selectAdaptiveRoute(policy, aggregate(), [linked, proposal], catalog))
    .toMatchObject({ effort: policy.initialEffort, decision: { accepted: false, reason: "The model does not support that effort." } });
  expect(selectAdaptiveRoute(policy, aggregate(), [linked, proposal]).decision?.accepted).toBe(true);
  expect(supportsAdaptiveEffort("codex", "gpt-6.1-sol", "ultra", catalog)).toBe(false);
  expect(supportsAdaptiveEffort("codex", "gpt-6.1-sol", "ultra", [{ model: "gpt-6.1-sol", supportedEfforts: [] }])).toBe(true);
});
