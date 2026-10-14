import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import {
  accountPoolReadOrder,
  agentRunPoolAccount,
  buildAgentRunAccountPool,
  collectAgentRunAccountSwitches,
  decideAccountPoolRotation,
  describeAgentRunAccountSwitch,
  normalizeAgentRunAccountPool,
} from "../src/lib/agent-runs/account-pool";
import { buildAgentRunStartInput } from "../src/lib/agent-runs/agent-run";
import { AgentRunSchema, AgentRunStartInputSchema, type AgentRunAggregate } from "../src/lib/agent-runs/domain";
import { applyAgentRunDecision, decideAgentRunAction, type AgentRunObservation } from "../src/lib/agent-runs/policy";
import { describeAgentRunUsageLimit } from "../src/lib/agent-runs/usage-limit";
import { getTurnProviderSessionCursor } from "../src/lib/providers/provider-sessions";
import { listRunAccountPoolRows } from "../src/components/session/use-run-account-pool";
import { AGENT_RUN_NOW, agentRunFixture, applyChange, observe, turn } from "./fixtures/agent-run-fixtures";

const SYSTEM = "system-default";
const WORK = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const PERSONAL = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const GATEWAY = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";
const FINGERPRINT = { providerId: "claude-code" as const, model: "sonnet" };

const PROFILES = [
  { id: SYSTEM, providerId: "claude-code" as const, label: "System default", kind: "system" as const },
  { id: SYSTEM, providerId: "codex" as const, label: "System default", kind: "system" as const },
  { id: WORK, providerId: "claude-code" as const, label: "Work", kind: "managed" as const },
  { id: PERSONAL, providerId: "claude-code" as const, label: "Personal", kind: "managed" as const },
  // An API connection serves the provider too, and must never be pooled.
  { id: GATEWAY, providerId: "claude-code" as const, label: "Company gateway", kind: "managed" as const,
    gateway: { baseUrl: "https://ai-gateway.example/v1", secretId: "secret-1", models: ["anthropic/claude-sonnet-5"] } },
];

function pooled(accountIds = [WORK, PERSONAL, SYSTEM]): AgentRunAggregate {
  const aggregate = agentRunFixture();
  return { ...aggregate, agentRun: AgentRunSchema.parse({ ...aggregate.agentRun, accountPool: { accountIds } }) };
}

function decide(aggregate: AgentRunAggregate, observation: AgentRunObservation, now = AGENT_RUN_NOW) {
  return decideAgentRunAction({ aggregate, observation, now });
}

/** The first stage turn ran on Work and stopped on its usage limit. */
function limitedOn(account: string, extra: Partial<AgentRunObservation> = {}) {
  return observe({ lastEndedTurn: turn({ endedAt: AGENT_RUN_NOW.toISOString(), usageLimited: {
    resetsAt: "2026-09-26T11:00:00.000Z", accountProfileId: account, fingerprint: FINGERPRINT } }), ...extra });
}

function started(aggregate: AgentRunAggregate) {
  const decision = decide(aggregate, observe());
  return applyChange(aggregate, applyAgentRunDecision({ aggregate, decision, now: AGENT_RUN_NOW }));
}

describe("account pool snapshot at start", () => {
  test("the run's account first, then Settings order; only confirmed sign-ins join, never an API connection or a left-out account", () => {
    const signedIn = [SYSTEM, WORK, PERSONAL, GATEWAY];
    expect(buildAgentRunAccountPool({ providerId: "claude-code", currentAccountId: PERSONAL, profiles: PROFILES, signedInAccountIds: signedIn }))
      .toEqual({ accountIds: [PERSONAL, SYSTEM, WORK] });
    expect(buildAgentRunAccountPool({ providerId: "claude-code", currentAccountId: WORK, profiles: PROFILES,
      excludedAccountIds: [SYSTEM, WORK], signedInAccountIds: signedIn })).toEqual({ accountIds: [WORK, PERSONAL] });
    // Signed out, a failed check, or no answer yet: not confirmed, so not pooled.
    expect(buildAgentRunAccountPool({ providerId: "claude-code", currentAccountId: WORK, profiles: PROFILES,
      signedInAccountIds: [PERSONAL] })).toEqual({ accountIds: [WORK, PERSONAL] });
    expect(buildAgentRunAccountPool({ providerId: "claude-code", currentAccountId: WORK, profiles: PROFILES, signedInAccountIds: [] })).toBeNull();
    // A run that starts on an API connection has no subscription pool.
    expect(buildAgentRunAccountPool({ providerId: "claude-code", currentAccountId: GATEWAY, profiles: PROFILES, signedInAccountIds: signedIn })).toBeNull();
    expect(buildAgentRunAccountPool({ providerId: "codex", currentAccountId: SYSTEM, profiles: PROFILES, signedInAccountIds: signedIn })).toBeNull();
  });

  test("the host keeps only subscription accounts of the run's provider, its account first", () => {
    expect(normalizeAgentRunAccountPool({ pool: { accountIds: [PERSONAL, GATEWAY, WORK] }, currentAccountId: WORK,
      subscriptionAccountIds: [SYSTEM, WORK, PERSONAL] })).toEqual({ accountIds: [WORK, PERSONAL] });
    expect(normalizeAgentRunAccountPool({ pool: { accountIds: [WORK, GATEWAY] }, currentAccountId: WORK,
      subscriptionAccountIds: [SYSTEM, WORK, PERSONAL] })).toBeNull();
    expect(normalizeAgentRunAccountPool({ pool: undefined, currentAccountId: WORK })).toBeNull();
  });

  test("the start input carries the pool only when there is one, and the schema refuses duplicates", () => {
    const base = { workspaceId: "ws-1", taskId: "task-1", agent: { name: "Builder" }, assignment: "Ship it.", now: AGENT_RUN_NOW };
    expect(buildAgentRunStartInput({ ...base, accountPool: { accountIds: [WORK, PERSONAL] } }).accountPool).toEqual({ accountIds: [WORK, PERSONAL] });
    expect("accountPool" in buildAgentRunStartInput({ ...base, accountPool: null })).toBe(false);
    const input = buildAgentRunStartInput({ ...base, accountPool: { accountIds: [WORK, WORK] } });
    expect(AgentRunStartInputSchema.safeParse(input).success).toBe(false);
  });

  test("the composer lists the run's account first and never an API connection", () => {
    expect(listRunAccountPoolRows({ providerId: "claude-code", currentAccountId: PERSONAL, profiles: PROFILES, excludedAccountIds: [WORK] }))
      .toEqual([
        { id: PERSONAL, label: "Personal", current: true, included: true },
        { id: SYSTEM, label: "System default", current: false, included: true },
        { id: WORK, label: "Work", current: false, included: false },
      ]);
    expect(listRunAccountPoolRows({ providerId: "claude-code", currentAccountId: GATEWAY, profiles: PROFILES })).toEqual([]);
    expect(listRunAccountPoolRows({ providerId: "claude-code", currentAccountId: WORK, profiles: PROFILES, lockedAccountIds: [WORK, SYSTEM] })
      .map((row) => [row.label, row.current])).toEqual([["Work", true], ["System default", false]]);
  });
});

describe("account pool rotation decisions", () => {
  const now = AGENT_RUN_NOW;
  test("the first account with usage left, never the one that just stopped", () => {
    expect(decideAccountPoolRotation({ now, limitedAccountId: WORK, usage: [
      { accountProfileId: WORK, status: "headroom" },
      { accountProfileId: PERSONAL, status: "exhausted", resetsAt: "2026-09-26T12:00:00.000Z" },
      { accountProfileId: SYSTEM, status: "headroom" },
    ] })).toEqual({ kind: "use", accountProfileId: SYSTEM });
  });

  test("an account whose usage read is unavailable is never switched to", () => {
    expect(decideAccountPoolRotation({ now, limitedAccountId: WORK, usage: [
      { accountProfileId: WORK, status: "exhausted", resetsAt: "2026-09-26T12:00:00.000Z" },
      { accountProfileId: PERSONAL, status: "unavailable" },
      { accountProfileId: SYSTEM, status: "headroom" },
    ] })).toEqual({ kind: "use", accountProfileId: SYSTEM });
    // At a due reset too: the unreadable account is skipped, the reset still waited for.
    expect(decideAccountPoolRotation({ now, usage: [
      { accountProfileId: PERSONAL, status: "unavailable" },
      { accountProfileId: WORK, status: "exhausted", resetsAt: "2026-09-26T12:00:00.000Z" },
    ] })).toEqual({ kind: "wait", resetsAt: "2026-09-26T12:00:00.000Z", resumeAt: "2026-09-26T12:01:00.000Z" });
  });

  test("none left: the earliest known reset plus the grace; unreadable only: retry; nothing known: the user resumes", () => {
    expect(decideAccountPoolRotation({ now, limitedAccountId: WORK, limitedResetsAt: "2026-09-26T13:00:00.000Z", usage: [
      { accountProfileId: WORK, status: "exhausted", resetsAt: "2026-09-26T13:00:00.000Z" },
      { accountProfileId: PERSONAL, status: "exhausted", resetsAt: "2026-09-26T11:30:00.000Z" },
      { accountProfileId: SYSTEM, status: "unavailable" },
    ] })).toEqual({ kind: "wait", resetsAt: "2026-09-26T11:30:00.000Z", resumeAt: "2026-09-26T11:31:00.000Z" });
    expect(decideAccountPoolRotation({ now, usage: [{ accountProfileId: WORK, status: "unavailable" }] }))
      .toEqual({ kind: "wait", resetsAt: null, resumeAt: "2026-09-26T10:05:00.000Z" });
    expect(decideAccountPoolRotation({ now, usage: [{ accountProfileId: WORK, status: "exhausted" }] }))
      .toEqual({ kind: "wait", resetsAt: null, resumeAt: null });
  });

  test("reads: the limited account then the others in pool order; at a due reset the whole pool; off or another provider: none", () => {
    const run = pooled().agentRun;
    expect(accountPoolReadOrder({ agentRun: run, providerId: "claude-code", limitedAccountId: PERSONAL, due: false }))
      .toEqual([PERSONAL, WORK, SYSTEM]);
    expect(accountPoolReadOrder({ agentRun: run, providerId: "claude-code", limitedAccountId: PERSONAL, due: true }))
      .toEqual([WORK, PERSONAL, SYSTEM]);
    // An account that is no longer a subscription account of the provider is skipped.
    expect(accountPoolReadOrder({ agentRun: run, providerId: "claude-code", limitedAccountId: WORK, due: false,
      subscriptionAccountIds: [WORK, SYSTEM] })).toEqual([WORK, SYSTEM]);
    expect(accountPoolReadOrder({ agentRun: run, providerId: "codex", limitedAccountId: WORK, due: false })).toBeNull();
    expect(accountPoolReadOrder({ agentRun: agentRunFixture().agentRun, providerId: "claude-code", limitedAccountId: WORK, due: false })).toBeNull();
  });

  test("pool off: a limited turn pauses exactly as before", () => {
    const aggregate = started(agentRunFixture());
    expect(decide(aggregate, limitedOn(WORK))).toEqual({ action: "pause", reason: "usage-limit", detail: "", usageLimit: {
      turnId: "turn-1", resetsAt: "2026-09-26T11:00:00.000Z", resumeAt: "2026-09-26T11:01:00.000Z", accountProfileId: WORK, fingerprint: FINGERPRINT } });
  });

  test("pool on, another account has usage: switch quietly and continue on it with the account-switch briefing", () => {
    const aggregate = started(pooled());
    const observation = limitedOn(WORK, { accountPoolUsage: [
      { accountProfileId: WORK, status: "exhausted", resetsAt: "2026-09-26T11:00:00.000Z" },
      { accountProfileId: PERSONAL, status: "headroom" },
    ] });
    const decision = decide(aggregate, observation);
    expect(decision).toMatchObject({ action: "switch-account", from: WORK, to: PERSONAL,
      usageLimit: { turnId: "turn-1", accountProfileId: PERSONAL, resumeAt: null, fingerprint: FINGERPRINT } });
    const change = applyAgentRunDecision({ aggregate, decision, now: AGENT_RUN_NOW });
    expect(change.events).toEqual([{ kind: "account-switched", idempotencyKey: `agent-run-1:account-switched:turn-1:${PERSONAL}`,
      detail: { providerId: "claude-code", from: WORK, to: PERSONAL, reason: "usage-limit", turnId: "turn-1" } }]);
    const switched = applyChange(aggregate, change);
    expect(switched.agentRun).toMatchObject({ state: "running", pauseReason: null });
    expect(agentRunPoolAccount(switched.agentRun)).toEqual({ providerId: "claude-code", accountProfileId: PERSONAL });
    expect(decide(switched, observation)).toMatchObject({ action: "start-stage-turn", reason: "resume-after-account-switch" });
  });

  test("pool on, every account exhausted: wait for the earliest reset, then check the pool in order", () => {
    const aggregate = started(pooled());
    const waiting = decide(aggregate, limitedOn(WORK, { accountPoolUsage: [
      { accountProfileId: WORK, status: "exhausted", resetsAt: "2026-09-26T11:00:00.000Z" },
      { accountProfileId: PERSONAL, status: "exhausted", resetsAt: "2026-09-26T10:30:00.000Z" },
      { accountProfileId: SYSTEM, status: "exhausted", resetsAt: "2026-09-26T12:00:00.000Z" },
    ] }));
    expect(waiting).toMatchObject({ action: "pause", reason: "usage-limit",
      usageLimit: { accountProfileId: WORK, resetsAt: "2026-09-26T10:30:00.000Z", resumeAt: "2026-09-26T10:31:00.000Z" } });
    const paused = applyChange(aggregate, applyAgentRunDecision({ aggregate, decision: waiting, now: AGENT_RUN_NOW }));
    expect(describeAgentRunUsageLimit(paused.agentRun)).toContain("first account with usage left");
    const due = new Date("2026-09-26T10:31:00.000Z");
    expect(decide(paused, limitedOn(WORK), new Date("2026-09-26T10:20:00.000Z"))).toEqual({ action: "idle" });
    expect(decide(paused, limitedOn(WORK, { accountPoolUsage: [
      { accountProfileId: WORK, status: "exhausted", resetsAt: "2026-09-26T11:00:00.000Z" },
      { accountProfileId: PERSONAL, status: "headroom" },
    ] }), due)).toMatchObject({ action: "switch-account", from: WORK, to: PERSONAL });
    expect(decide(paused, limitedOn(WORK, { accountPoolUsage: [{ accountProfileId: WORK, status: "headroom" }] }), due))
      .toEqual({ action: "resume" });
    expect(decide(paused, limitedOn(WORK, { accountPoolUsage: [
      { accountProfileId: WORK, status: "exhausted", resetsAt: "2026-09-26T11:00:00.000Z" },
      { accountProfileId: PERSONAL, status: "exhausted", resetsAt: "2026-09-26T14:00:00.000Z" },
      { accountProfileId: SYSTEM, status: "exhausted", resetsAt: "2026-09-26T12:00:00.000Z" },
    ] }), due)).toMatchObject({ action: "pause", usageLimit: { resetsAt: "2026-09-26T11:00:00.000Z", resumeAt: "2026-09-26T11:01:00.000Z" } });
  });

  test("the switch reads as one line in the timeline and the report", () => {
    expect(describeAgentRunAccountSwitch({ from: "Work", to: "Personal" })).toBe("Account switched · Work → Personal · usage limit");
    expect(collectAgentRunAccountSwitches([{ id: "e1", agentRunId: "agent-run-1", sequence: 3, kind: "account-switched", idempotencyKey: null,
      detail: { from: SYSTEM, to: WORK, toLabel: "Work", fromLabel: "System default" }, createdAt: AGENT_RUN_NOW.toISOString() }]))
      .toEqual([{ from: "System default", to: "Work", reason: "usage-limit", at: AGENT_RUN_NOW.toISOString() }]);
  });
});

describe("account pool persistence", () => {
  test("the pool round-trips, and rows from before the column load without one", () => {
    const db = new Database(":memory:");
    const store = new AgentRunStore(db);
    const aggregate = pooled([WORK, PERSONAL]);
    expect(store.create({ agentRun: aggregate.agentRun, upserts: aggregate.stages, events: [] }, AGENT_RUN_NOW)).toEqual({ ok: true });
    expect(new AgentRunStore(db).getAgentRun("agent-run-1")?.accountPool).toEqual({ accountIds: [WORK, PERSONAL] });

    const legacy = new Database(":memory:");
    const legacyStore = new AgentRunStore(legacy);
    const plain = agentRunFixture({ id: "agent-run-2", leadTaskId: "task-2" });
    legacyStore.create({ agentRun: plain.agentRun, upserts: plain.stages, events: [] }, AGENT_RUN_NOW);
    legacy.exec("ALTER TABLE agent_runs DROP COLUMN account_pool_json");
    const reopened = new AgentRunStore(legacy);
    expect(reopened.getAgentRun("agent-run-2")?.accountPool).toBeUndefined();
    expect(reopened.getAgentRun("agent-run-2")?.state).toBe("running");
    db.close(); legacy.close();
  });
});

describe("a turn resumes only its own account's conversation", () => {
  const sessions = { "claude-code": { nativeSessionId: "session-system" }, accounts: { [WORK]: { "claude-code": { nativeSessionId: "session-work" } } } };
  test("a switched account starts fresh instead of resuming another account's session", () => {
    expect(getTurnProviderSessionCursor({ sessions, providerId: "claude-code", runtimeOptions: { claudeAccountProfileId: PERSONAL } })).toBeNull();
    expect(getTurnProviderSessionCursor({ sessions, providerId: "claude-code", fallbackAccountId: WORK })?.nativeSessionId).toBe("session-work");
    expect(getTurnProviderSessionCursor({ sessions, providerId: "claude-code", runtimeOptions: { claudeAccountProfileId: SYSTEM } })?.nativeSessionId)
      .toBe("session-system");
    expect(getTurnProviderSessionCursor({ sessions, providerId: "claude-code" })?.nativeSessionId).toBe("session-system");
  });
});
