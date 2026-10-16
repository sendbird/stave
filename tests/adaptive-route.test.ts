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
test("adaptive Gateway runs freeze only pinned models and reject an unpinned seed", () => {
  const args = { providerId: "codex" as const, model: "openai/gpt-6-luna", agent: null, settings: null, maxTurns: 30,
    draft: { autoRouting: true }, exclusiveModels: ["openai/gpt-6-luna", "moonshotai/kimi-k3"] };
  expect(freezeAdaptivePolicy(args).allowedModels).toEqual(args.exclusiveModels);
  expect(() => freezeAdaptivePolicy({ ...args, model: "gpt-6-astra" })).toThrow("pinned");
});
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
test("automatic Decision proposals share pins, same-provider catalog, cooldown and change limits without hiding Agent requests", () => {
  const proposal = { model: "gpt-6-luna", effort: "low", rationale: "Low complexity" };
  expect(selectAdaptiveRoute(policy, aggregate(0), [], null, proposal).decision).toMatchObject({ accepted: true, automatic: true });
  expect(selectAdaptiveRoute({ ...policy, modelLocked: true }, aggregate(0), [], null, proposal).decision).toMatchObject({ accepted: false, reason: "The model is pinned." });
  expect(selectAdaptiveRoute(policy, aggregate(0), [], null, { ...proposal, model: "anthropic/claude-opus-5.5" }).decision?.accepted).toBe(false);
  const automatic = event(2, "resource-decision", { accepted: true, automatic: true, requestSequence: null, turnCount: 0, model: "gpt-6-luna", effort: "low" });
  // A step-up the work needs is not held; a step-down waits for the cooldown.
  expect(selectAdaptiveRoute(policy, aggregate(1), [automatic], null, { ...proposal, model: "gpt-6.1-sol" }).decision).toMatchObject({ accepted: true, model: "gpt-6.1-sol" });
  const strong = event(2, "resource-decision", { accepted: true, automatic: true, requestSequence: null, turnCount: 0, model: "gpt-6-astra", effort: "high" });
  const down = selectAdaptiveRoute(policy, aggregate(1), [strong], null, { ...proposal, model: "gpt-5.6-terra" });
  expect(down.decision).toMatchObject({ accepted: false, reason: "The two-turn cooldown is active." });
  expect(down.cause).toBe("cooldown");
  const pending = request(3, "gpt-6.1-sol");
  expect(selectAdaptiveRoute(policy, aggregate(3), [linked, automatic, pending], null, proposal).requestSequence).toBe(3);
});
test("the cooldown counts every turn linked since the change, the user's replies included", () => {
  const placement = event(2, "resource-decision", { accepted: true, automatic: true, requestSequence: null, turnCount: 0, linkedTurnCount: 0, model: "gpt-6-astra", effort: "high" });
  const reply = event(4, "turn-linked", { stageId: "work", attempt: 1, turnId: "reply-1", reason: "user-reply" });
  // A change that is not a step-up stays under the cooldown.
  const lateral = event(5, "resource-request", { stageId: "work", attempt: 1,
    request: { model: "gpt-5.6-terra", reason: "capability-mismatch", rationale: "A heavier model is not needed", evidenceRefs: ["t1"] } });
  // One supervised turn ran on the placement: too soon.
  expect(selectAdaptiveRoute(policy, aggregate(1), [linked, placement, lateral]).decision)
    .toMatchObject({ accepted: false, reason: "The two-turn cooldown is active." });
  // A supervised turn and a reply ran on it: the change is due, though only one supervised turn started.
  expect(selectAdaptiveRoute(policy, aggregate(1), [linked, placement, reply, lateral]).decision)
    .toMatchObject({ accepted: true, model: "gpt-5.6-terra", linkedTurnCount: 2 });
  // A decision saved before linked turns were counted keeps the supervised-turn rule.
  const { linkedTurnCount: _unsaved, ...legacy } = placement.detail;
  expect(selectAdaptiveRoute(policy, aggregate(1), [linked, { ...placement, detail: legacy }, reply, lateral]).decision)
    .toMatchObject({ accepted: false, reason: "The two-turn cooldown is active." });
});
test("the user's explicit request and a needed step-up are not held by the cooldown or the change limit", () => {
  const placement = event(2, "resource-decision", { accepted: true, automatic: true, requestSequence: null, turnCount: 0, linkedTurnCount: 0, model: "gpt-6-luna", effort: "low" });
  const ask = (sequence: number, request: Record<string, unknown>) => event(sequence, "resource-request", { stageId: "work", attempt: 1,
    request: { rationale: "Cited turn", evidenceRefs: ["t1"], ...request } });
  // Right after the placement: a step-up for a capability gap and the user's request both go through.
  expect(selectAdaptiveRoute(policy, aggregate(1), [linked, placement, ask(3, { model: "gpt-6.1-sol", reason: "capability-mismatch" })]).decision)
    .toMatchObject({ accepted: true, model: "gpt-6.1-sol" });
  expect(selectAdaptiveRoute(policy, aggregate(1), [linked, placement, ask(3, { model: "gpt-6.1-sol", reason: "user-request" })]).decision)
    .toMatchObject({ accepted: true, model: "gpt-6.1-sol", reason: "user-request" });
  // Two changes spent: a user request may still step down, a capability step-up may still go up, a mechanical step may not.
  const changed = [linked, placement,
    event(3, "resource-decision", { accepted: true, requestSequence: 3, turnCount: 1, linkedTurnCount: 1, model: "gpt-6.1-sol", effort: "high" })];
  expect(selectAdaptiveRoute(policy, aggregate(1), [...changed, ask(4, { model: "gpt-6-luna", effort: "low", reason: "user-request" })]).decision)
    .toMatchObject({ accepted: true, model: "gpt-6-luna" });
  expect(selectAdaptiveRoute(policy, aggregate(1), [...changed, ask(4, { effort: "xhigh", reason: "capability-mismatch" })]).decision)
    .toMatchObject({ accepted: true, effort: "xhigh" });
  expect(selectAdaptiveRoute(policy, aggregate(5), [...changed, ask(4, { model: "gpt-5.6-terra", reason: "mechanical-step" })]).decision)
    .toMatchObject({ accepted: false, reason: "The change limit is reached." });
  // Pins and the eligible catalog still bound a user request relayed by the Agent.
  expect(selectAdaptiveRoute({ ...policy, modelLocked: true }, aggregate(1), [linked, ask(3, { model: "gpt-6-luna", reason: "user-request" })]).decision)
    .toMatchObject({ accepted: false, reason: "The model is pinned." });
  expect(selectAdaptiveRoute(policy, aggregate(1), [linked, ask(3, { model: "claude-opus-5-5", reason: "user-request" })]).decision)
    .toMatchObject({ accepted: false, reason: "The model is outside this Run's same-provider eligible catalog." });
});
test("a composer pin overrides the route, frozen pins and proposals until the composer returns to Auto", () => {
  const locked = { ...policy, allowedModels: ["gpt-6-luna"], modelLocked: true };
  const placement = event(2, "resource-decision", { accepted: true, automatic: true, requestSequence: null, turnCount: 0, linkedTurnCount: 0, model: "gpt-6-luna", effort: "low" });
  const pinSol = { modelPinned: true, effortPinned: false, model: "gpt-6.1-sol" };
  // A pin replaces the run's frozen model, even outside its frozen catalog.
  const pinned = selectAdaptiveRoute(locked, aggregate(1), [linked, placement], null, undefined, pinSol);
  expect(pinned).toMatchObject({ model: "gpt-6.1-sol", composerPin: { model: true, effort: false }, composerRefusal: null });
  expect(pinned.composerDecision).toMatchObject({ source: "composer", accepted: true, model: "gpt-6.1-sol", modelPinned: true });
  const saved = event(3, "resource-decision", pinned.composerDecision!);
  // The same pin on the next reply records nothing new.
  expect(selectAdaptiveRoute(locked, aggregate(1), [linked, placement, saved], null, undefined, pinSol).composerDecision).toBeNull();
  // While pinned, the automatic proposal and the Agent's request are refused, and supervised turns keep the pin.
  const automatic = selectAdaptiveRoute(policy, aggregate(4), [linked, placement, saved], null, { model: "gpt-6-luna", rationale: "Low" });
  expect(automatic).toMatchObject({ model: "gpt-6.1-sol", cause: "composer-pin" });
  const asked = event(4, "resource-request", { stageId: "work", attempt: 1, request: { model: "gpt-6-astra", reason: "user-request", rationale: "x", evidenceRefs: ["t1"] } });
  expect(selectAdaptiveRoute(policy, aggregate(4), [linked, placement, saved, asked]).decision).toMatchObject({ accepted: false, reason: "The model is pinned in the composer." });
  // Back on Auto: the release is recorded once, the model stays, and adaptation resumes from it.
  const released = selectAdaptiveRoute(policy, aggregate(4), [linked, placement, saved], null, undefined, { modelPinned: false, effortPinned: false });
  expect(released).toMatchObject({ model: "gpt-6.1-sol", composerPin: null });
  expect(released.composerDecision).toMatchObject({ source: "composer", modelPinned: false, model: "gpt-6.1-sol" });
  const free = event(5, "resource-decision", released.composerDecision!);
  expect(selectAdaptiveRoute(policy, aggregate(4), [linked, placement, saved, free], null, { model: "gpt-6-astra", effort: "xhigh", rationale: "Harder" }).decision)
    .toMatchObject({ accepted: true, model: "gpt-6-astra" });
  expect(selectAdaptiveRoute(policy, aggregate(4), [linked, placement, saved, free], null, undefined, { modelPinned: false, effortPinned: false }).composerDecision).toBeNull();
  // A run that froze its model at start gets it back when the pin is released, instead of staying on the pin.
  const restored = selectAdaptiveRoute(locked, aggregate(4), [linked, placement, saved], null, undefined, { modelPinned: false, effortPinned: false });
  expect(restored).toMatchObject({ model: "gpt-6-luna", composerPin: null });
  expect(restored.composerDecision).toMatchObject({ source: "composer", modelPinned: false, model: "gpt-6-luna" });
  // A pin this provider cannot run, or one the account catalog lacks, refuses the reply.
  expect(selectAdaptiveRoute(policy, aggregate(1), [linked], null, undefined, { ...pinSol, model: "claude-opus-5-5" }).composerRefusal).toContain("not available");
  expect(selectAdaptiveRoute(policy, aggregate(1), [linked], [{ model: "gpt-6-luna", supportedEfforts: [] }], undefined, pinSol).composerRefusal).toContain("not available");
  // Without a cached catalog, a model the built-in catalog does not know is taken as the composer offered it.
  expect(selectAdaptiveRoute(policy, aggregate(1), [linked], null, undefined, { ...pinSol, model: "gpt-7-preview" }).composerRefusal).toBeNull();
  // A model only the fresh account catalog knows can be pinned.
  expect(selectAdaptiveRoute(policy, aggregate(1), [linked], [{ model: "gpt-7-preview", supportedEfforts: ["high"] }], undefined,
    { ...pinSol, model: "gpt-7-preview" })).toMatchObject({ model: "gpt-7-preview", composerRefusal: null });
  // A pinned effort the pinned model does not support refuses it too.
  expect(selectAdaptiveRoute(policy, aggregate(1), [linked], [{ model: "gpt-6.1-sol", supportedEfforts: ["medium"] }], undefined,
    { ...pinSol, effortPinned: true, effort: "ultra" }).composerRefusal).toContain("effort");
});
test("an explicit request outranks the automatic proposal and says so", () => {
  const pending = event(3, "resource-request", { stageId: "work", attempt: 1, request: { model: "gpt-6-astra", reason: "user-request", rationale: "Asked", evidenceRefs: ["t1"] } });
  expect(selectAdaptiveRoute(policy, aggregate(1), [linked, pending], null, { model: "gpt-6-luna", rationale: "Low" })).toMatchObject({ model: "gpt-6-astra", cause: "request" });
});
test("explicit model and effort pins are frozen without taking a caller authority field", () => {
  const p = freezeAdaptivePolicy({ providerId: "codex", model: "gpt-6.1-sol", agent: null, settings: null, maxTurns: 100,
    draft: { model: "gpt-6-astra", modelProviderId: "codex", codexReasoningEffort: "high" } });
  expect(p).toMatchObject({ allowedModels: ["gpt-6-astra"], modelLocked: true, effortLocked: true, initialEffort: "high" });
});
test("a composer pin wins over a fixed Agent model on its provider; another provider is refused at start", () => {
  const agent = { ...getBuiltinAgent("builder")!, model: { mode: "fixed" as const, providerId: "codex" as const, model: "gpt-6.1-sol", effort: "high" as const } };
  expect(freezeAdaptivePolicy({ providerId: "codex", model: "gpt-6.1-sol", agent, settings: null, maxTurns: 30,
    draft: { model: "gpt-6-astra", modelProviderId: "codex" } })).toMatchObject({ allowedModels: ["gpt-6-astra"], modelLocked: true });
  expect(freezeAdaptivePolicy({ providerId: "codex", model: "gpt-6-astra", agent, settings: null, maxTurns: 30, draft: null }))
    .toMatchObject({ allowedModels: ["gpt-6.1-sol"], modelLocked: true, effortLocked: true, initialEffort: "high" });
  // A fixed Agent compiles for its own provider only, so a pin on another provider is refused before any turn.
  expect(() => freezeAdaptivePolicy({ providerId: "claude-code", model: "claude-opus-5-5", agent, settings: null, maxTurns: 30,
    draft: { model: "claude-opus-5-5", modelProviderId: "claude-code" } })).toThrow("another provider");
  expect(() => freezeAdaptivePolicy({ providerId: "claude-code", model: "claude-opus-5-5", agent, settings: null, maxTurns: 30, draft: null }))
    .toThrow("another provider");
});
test("a helper of a run that froze the version 1 policy keeps version 1, so native subagents stay off for it", () => {
  const child = freezeAdaptivePolicy({ providerId: "codex", model: "gpt-6.1-sol", agent: null, settings: null, maxTurns: 30, delegated: true });
  expect(constrainHelperResources({ ...policy, version: 1, concurrentHelpers: 2, totalHelpers: 4 }, child, "gpt-6.1-sol"))
    .toMatchObject({ version: 1, concurrentHelpers: 2, totalHelpers: 4 });
  expect(constrainHelperResources(policy, child, "gpt-6.1-sol").version).toBe(2);
});
test("the team budget is the run's max turns, and the helper limits come from Settings within their range", () => {
  const freeze = (maxTurns: number, teamLimits?: { concurrentHelpers: number; totalHelpers: number }) => freezeAdaptivePolicy({ providerId: "codex",
    model: "gpt-6.1-sol", agent: null, maxTurns, draft: null,
    settings: teamLimits ? { routing: { autoRoutingEnabled: false, autoRoutingProfile: undefined }, classifier: null, teamLimits } : null });
  expect(freeze(100)).toMatchObject({ version: 2, teamTurns: 100, concurrentHelpers: 3, totalHelpers: 8, maxChanges: 2, cooldownTurns: 2 });
  expect(freeze(45, { concurrentHelpers: 2, totalHelpers: 12 })).toMatchObject({ teamTurns: 45, concurrentHelpers: 2, totalHelpers: 12 });
  // A hand-edited setting outside the range is clamped, never rejected.
  expect(freeze(30, { concurrentHelpers: 40, totalHelpers: 0 })).toMatchObject({ concurrentHelpers: 6, totalHelpers: 1 });
});
test("a helper on another provider keeps its own catalog unless the parent's model is pinned", () => {
  const claudeChild = freezeAdaptivePolicy({ providerId: "claude-code", model: "claude-opus-5-5", agent: null, settings: null, maxTurns: 30, delegated: true });
  const constrained = constrainHelperResources(policy, claudeChild, "claude-opus-5-5");
  expect(constrained).toMatchObject({ providerId: "claude-code", teamTurns: policy.teamTurns, concurrentHelpers: policy.concurrentHelpers, totalHelpers: policy.totalHelpers });
  expect(constrained.allowedModels).toContain("claude-opus-5-5");
  expect(() => constrainHelperResources({ ...policy, modelLocked: true }, claudeChild, "claude-opus-5-5")).toThrow("pinned");
  // A run that froze the opt-in version 1 policy keeps its provider for every helper.
  expect(() => constrainHelperResources({ ...policy, version: 1 }, claudeChild, "claude-opus-5-5")).toThrow("pinned");
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
