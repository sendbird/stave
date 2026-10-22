import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { AgentRunOverview } from "../src/components/agent-runs/AgentRunOverview";
import { describeQueuedTurnDelivery } from "../src/components/session/composer-shelf/composer-shelf.utils";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import { buildAgentRunStartInput } from "../src/lib/agent-runs/agent-run";
import { RunHeaderContract } from "../src/components/agent-runs/RunContract";
import { buildRunContract, resolveRunApprovalOptions, type RunContractInput } from "../src/lib/agent-runs/run-contract";
import { useAppStore } from "../src/store/app.store";
import { withConfirmedApprovals, type AgentTurnProvenance } from "../src/lib/agents/turn-provenance";
import type { NormalizedProviderEvent } from "../src/lib/providers/provider.types";
import { replayProviderEventsToTaskState } from "../src/lib/session/provider-event-replay";

/** Server rendering reads the store's initial state, so state is written there for one render. */
function withState<T>(patch: Record<string, unknown>, render: () => T): T {
  const initial = useAppStore.getInitialState() as unknown as Record<string, unknown>;
  const saved = Object.fromEntries(Object.keys(patch).map((key) => [key, initial[key]]));
  Object.assign(initial, patch);
  try {
    return render();
  } finally {
    Object.assign(initial, saved);
  }
}
import type { Workflow } from "../src/lib/workflows/schema";

const NOW = new Date("2026-10-22T09:00:00.000Z");
const workspace = { name: "billing-fix", branch: "stave/billing-fix", worktree: true };

/** A run as the composer would start it for an agent with this workflow and permission. */
function startFor(agent: Parameters<typeof buildAgentRunStartInput>[0]["agent"]) {
  return buildAgentRunStartInput({ workspaceId: "ws", taskId: "task", agent, assignment: "", now: NOW });
}
function contractFor(start: ReturnType<typeof startFor>, patch: Partial<RunContractInput> = {}) {
  return buildRunContract({ workspace, permission: null, workflow: start.workflow, authorizedEffectStageIds: start.consent.authorizedEffectStageIds, maxTurns: start.maxTurns!, ...patch });
}

const shipWorkflow: NonNullable<Workflow["stages"]> = [
  { id: "implement", title: "Implement", kind: "ai", instruction: "Make the change.", doneWhen: "It builds.",
    acceptanceCriteria: [{ text: "Workspace checks pass (lint, test)", required: true, verification: "stave-check", scriptIds: ["lint", "test"], mode: "all" }] },
  { id: "open-draft-pr", title: "Open draft PR", kind: "action", action: { type: "open-draft-pr" } },
];

afterEach(() => applyAppLocale("en"));

const unconfirmedAuto = "unless your organization turns automatic review off";

/** A Codex Auto run's header over these lead-task messages; `turn` builds a turn row with its provenance. */
function codexRunHeader() {
  const detail = structuredClone(buildAgentRunFixtures(NOW).working);
  detail.agentRun.fingerprint = { ...detail.agentRun.fingerprint, providerId: "codex" };
  detail.agentRun.consent = { ...detail.agentRun.consent, permissionMode: "auto" };
  const turn = (applied: Record<string, string>, options: { turnId?: string; confirmed?: boolean } = {}) => {
    const turnId = options.turnId ?? "turn-run";
    return {
      id: `m-${turnId}`, role: "assistant", model: "gpt", providerId: "codex", content: "", turnId,
      startedAt: new Date(Date.parse(detail.agentRun.createdAt) + 60_000).toISOString(), parts: [],
      agentProvenance: {
        version: 1, turnId, assignmentId: "a", agentConfigId: "implementer", agentName: "Implementer", agentContentHash: "h",
        role: "primary", providerId: "codex", model: null, effort: null,
        permission: { source: "agent-autonomy", agentLimit: "auto", support: "enforced", applied, ...(options.confirmed === false ? {} : { approvalsConfirmed: true }) },
        instructions: { channel: "instruction", status: "configured" },
      },
    };
  };
  /** Links these turns to the run, as its supervisor records them once each started. */
  const link = (...turnIds: string[]) => {
    detail.events = turnIds.map((turnId, index) => ({
      id: `event-${turnId}`, agentRunId: detail.agentRun.id, sequence: index + 1, kind: "turn-linked" as const,
      idempotencyKey: `${detail.agentRun.id}:turn:${index + 1}:linked`, detail: { stageId: "work", attempt: 1, turnId },
      createdAt: detail.agentRun.createdAt,
    }));
  };
  link("turn-run", "turn-1", "turn-2");
  const checked = useAppStore.getInitialState().providerRuntimeCapabilities;
  const header = (messages: unknown[], codexChecked = true) => withState(
    {
      messagesByTask: { [detail.agentRun.leadTaskId]: messages },
      providerAvailability: { ...useAppStore.getInitialState().providerAvailability, codex: codexChecked },
      providerRuntimeCapabilities: { ...checked, codex: { ...checked.codex, approval: { ...checked.codex.approval, autoClassifierPolicy: true } } },
    },
    () => renderToStaticMarkup(createElement(RunHeaderContract, { detail })),
  );
  return { detail, header, turn, link };
}

describe("run contract", () => {
  test("a one-stage write agent: where, what it may change, when it is done and when it comes back", () => {
    const contract = contractFor(startFor({ name: "Implementer", workflow: undefined, checkIns: undefined, permission: "auto" }), {
      permission: "auto",
      defaultCheck: { applies: true, scriptIds: ["lint", "test"] },
    });
    expect(contract.where).toBe("billing-fix, branch stave/billing-fix, in its own worktree");
    expect(contract.change).toEqual([
      "Edits files and runs commands here; the provider's auto mode decides each action and asks you when it cannot.",
      "Writes outside the repository, credential files and irreversible remote actions still come to you.",
    ]);
    expect(contract.done[0]).toBe("When each of its 3 stages reports done: Work → Review → Fix review findings");
    expect(contract.done).toContain("Stave also runs lint or test before it finishes; one passing script is enough.");
    expect(contract.comesBack).toEqual([
      "Only when it is stuck or needs an answer.",
      "Questions it cannot settle come to you.",
      "Pauses after 30 turns until you extend it, and at a usage limit.",
    ]);
  });

  test("a read-only agent changes nothing and gets no default check; unknown scripts are said as unknown", () => {
    const readOnly = contractFor(startFor({ name: "Researcher", workflow: undefined, checkIns: undefined, permission: "read-only" }), { permission: "read-only", defaultCheck: { applies: false, scriptIds: null } });
    expect(readOnly.change).toEqual(["Reads files and runs read-only commands; it changes nothing."]);
    expect(readOnly.done.join(" ")).not.toContain("Stave also runs");
    const unknown = contractFor(startFor({ name: "Implementer", workflow: undefined, checkIns: undefined, permission: "manual", reviewBeforeDone: "off" }), { defaultCheck: { applies: true, scriptIds: null } });
    expect(unknown.done).toEqual(["When the assignment is complete and verified.", "If the workspace has action scripts, one of them must pass before it finishes."]);
    expect(unknown.change[0]).toBe("Edits files and runs commands here without asking.");
    expect(contractFor(startFor({ name: "x", workflow: undefined, checkIns: undefined }), { workspace: { ...workspace, worktree: false, branch: null } }).where).toBe("billing-fix, in the repository folder");
  });

  test("before a run, Codex Auto does not promise its reviewer: an organization's policy can still turn it off", () => {
    const start = startFor({ name: "Implementer", workflow: undefined, checkIns: undefined, permission: "auto" });
    const unconfirmed = "Edits files and runs commands here. Codex's automatic review decides each action and asks you when unsure, unless your organization turns automatic review off; then it edits without asking.";
    expect(contractFor(start, { permission: "auto", providerId: "codex", codexAutoReview: true }).change[0]).toBe(unconfirmed);
    expect(contractFor(start, { permission: "auto", providerId: "codex", codexAutoReview: null }).change[0]).toBe(unconfirmed);
  });

  test("during a run, the line follows the approvals the runtime confirmed for its current turn", () => {
    const start = startFor({ name: "Implementer", workflow: undefined, checkIns: undefined, permission: "auto" });
    const auto = "Edits files and runs commands here; the provider's auto mode decides each action and asks you when it cannot.";
    // A managed policy turned the reviewer off: the runtime ran the turn with approvals `never`.
    expect(contractFor(start, { permission: "auto", providerId: "codex", codexAutoReview: true, confirmedApprovals: { codexApprovalPolicy: "never", codexApprovalsReviewer: "user" } }).change[0])
      .toBe("Edits files and runs commands here without asking: Codex's automatic review is off for this run, so its approvals are off.");
    expect(contractFor(start, { permission: "auto", providerId: "codex", codexAutoReview: true, confirmedApprovals: { codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review" } }).change[0]).toBe(auto);
  });

  test("Auto says what the run applies: a Codex without its reviewer runs with approvals off", () => {
    const start = startFor({ name: "Implementer", workflow: undefined, checkIns: undefined, permission: "auto" });
    const auto = "Edits files and runs commands here; the provider's auto mode decides each action and asks you when it cannot.";
    // The runtime falls back from on-request + auto_review to `never` when Codex has no reviewer.
    expect(resolveRunApprovalOptions({ providerId: "codex", permission: "auto", codexAutoReview: false })).toMatchObject({ codexApprovalPolicy: "never" });
    expect(contractFor(start, { permission: "auto", providerId: "codex", codexAutoReview: false }).change[0])
      .toBe("Edits files and runs commands here without asking: this Codex has no reviewer for Auto, so its approvals are off.");
    // Claude's Auto does not depend on Codex's reviewer.
    expect(contractFor(start, { permission: "auto", providerId: "claude-code", codexAutoReview: false }).change[0]).toBe(auto);
  });

  test("checks name their rule, and publishing asks first unless the agent checks in only when stuck", () => {
    const asks = contractFor(startFor({ name: "Shipper", workflow: shipWorkflow, checkIns: "plan-and-publishing", permission: "auto" }), { permission: "auto" });
    expect(asks.done).toContain("Stave runs lint and test itself; every one must pass.");
    expect(asks.change).toContain("Outside the workspace it may also: Open draft PR, after you sign off.");
    expect(asks.comesBack).toContain("Asks you before: Open draft PR.");
    const free = contractFor(startFor({ name: "Shipper", workflow: shipWorkflow, checkIns: "when-stuck", permission: "auto" }), { permission: "auto" });
    expect(free.change).toContain("Outside the workspace it may also: Open draft PR, without asking.");
    expect(free.comesBack.join(" ")).not.toContain("Asks you before");
    const legacy = shipWorkflow.map((stage) => stage.kind === "ai" ? { ...stage, acceptanceCriteria: stage.acceptanceCriteria!.map(({ mode: _mode, ...criterion }) => criterion) } : stage);
    expect(contractFor(startFor({ name: "Shipper", workflow: legacy, checkIns: "when-stuck" })).done).toContain("Stave runs lint or test itself; one passing script is enough.");
  });

  test("a Codex run's header states what its turns applied, and is unconfirmed before a turn ran", () => {
    const { header, turn } = codexRunHeader();
    expect(header([])).toContain(unconfirmedAuto);
    // Before Codex was checked its capabilities are only defaults: still unconfirmed, never "has no reviewer".
    expect(header([], false)).toContain(unconfirmedAuto);
    expect(header([turn({ codexApprovalPolicy: "never", codexApprovalsReviewer: "user" })])).toContain("automatic review is off for this run");
    expect(header([turn({ codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review" })])).toContain("the provider&#x27;s auto mode decides each action");
  });

  test("a Codex run's header stays unconfirmed until the runtime confirms its current turn's approvals", () => {
    const { header, turn } = codexRunHeader();
    const requested = { codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review" };
    // The turn's provenance starts with what it asked for; Codex has not accepted its start yet.
    expect(header([turn(requested, { confirmed: false })])).toContain(unconfirmedAuto);
    // An earlier turn's confirmation says nothing about the turn that is starting now.
    expect(header([
      turn({ codexApprovalPolicy: "never", codexApprovalsReviewer: "user" }, { turnId: "turn-1" }),
      turn(requested, { turnId: "turn-2", confirmed: false }),
    ])).toContain(unconfirmedAuto);
  });

  test("a run's header reads only the turns linked to that run", () => {
    const { header, turn, link } = codexRunHeader();
    link("turn-a");
    // Run A's turn ran with the reviewer; a later turn on the same task (another run, or a plain Agent turn) ran without it.
    const ownTurn = turn({ codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review" }, { turnId: "turn-a" });
    const laterTurn = turn({ codexApprovalPolicy: "never", codexApprovalsReviewer: "user" }, { turnId: "turn-b" });
    expect(header([ownTurn, laterTurn])).toContain("the provider&#x27;s auto mode decides each action");
    // A turn the run never linked says nothing about it, however recent.
    expect(header([laterTurn])).toContain(unconfirmedAuto);
  });

  test("a run's header says what replay stored once Codex confirmed the turn without its reviewer", () => {
    const { header, turn, link } = codexRunHeader();
    link("turn-a");
    const requested = turn({ codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review" }, { turnId: "turn-a", confirmed: false }).agentProvenance as AgentTurnProvenance;
    const confirmed = withConfirmedApprovals(requested, { codexApprovalPolicy: "never", codexApprovalsReviewer: "user" });
    const replay = (events: NormalizedProviderEvent[]) =>
      replayProviderEventsToTaskState({ taskId: "lead", provider: "codex", model: "gpt", turnId: "turn-a", events, messages: [] }).messages;
    expect(header(replay([{ type: "agent_provenance", provenance: requested }]))).toContain(unconfirmedAuto);
    expect(header(replay([{ type: "agent_provenance", provenance: requested }, { type: "agent_provenance", provenance: confirmed }])))
      .toContain("automatic review is off for this run");
  });

  test("the run's header shows the contract it started with, in English and Korean", () => {
    const detail = buildAgentRunFixtures(NOW).working;
    const html = renderToStaticMarkup(createElement(AgentRunOverview, { detail, now: NOW.getTime() }));
    expect(html).toContain('data-testid="run-contract-header"');
    for (const label of ["Where", "May change", "Done when", "Comes back to you"]) expect(html).toContain(label);
    applyAppLocale("ko");
    const korean = renderToStaticMarkup(createElement(AgentRunOverview, { detail, now: NOW.getTime() }));
    expect(korean).toContain("이 실행이 하는 일");
    expect(korean).toContain("돌아오는 때");
  });

  test("a queued item says how it will be delivered", () => {
    const item = { attachedFilePaths: [], attachments: [] };
    expect(describeQueuedTurnDelivery({ editing: true, turnActive: true, paused: false, canSteer: true, item })).toBe("held");
    expect(describeQueuedTurnDelivery({ editing: false, turnActive: true, paused: false, canSteer: true, item })).toBe("steerable");
    expect(describeQueuedTurnDelivery({ editing: false, turnActive: true, paused: false, canSteer: true, item: { ...item, attachedFilePaths: ["a.png"] } })).toBe("next-turn");
    expect(describeQueuedTurnDelivery({ editing: false, turnActive: true, paused: true, canSteer: false, item })).toBeNull();
    expect(describeQueuedTurnDelivery({ editing: false, turnActive: false, paused: false, canSteer: false, item })).toBeNull();
  });
});
