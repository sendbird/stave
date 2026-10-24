import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyAppLocale } from "@/i18n";
import { AgentRunOverview } from "../src/components/agent-runs/AgentRunOverview";
import { describeQueuedTurnDelivery } from "../src/components/session/composer-shelf/composer-shelf.utils";
import { buildAgentRunFixtures } from "../src/dev/agent-run-preview/agent-run-fixtures";
import { buildAgentRunStartInput } from "../src/lib/agent-runs/agent-run";
import { describeRunStartDraft, RunHeaderContract, RunStartNotice } from "../src/components/agent-runs/RunContract";
import { buildRunContract, buildRunContractSummary, resolveRunApprovalOptions, type RunContractInput } from "../src/lib/agent-runs/run-contract";
import { planAgentPromptSend, planAgentPromptSendForFit } from "../src/lib/agent-runs/agent-run";
import { AGENT_RUN_LIMITS } from "../src/lib/agent-runs/domain";
import { getBuiltinAgent } from "../src/lib/agents/starters";
import type { AgentAssignment } from "../src/lib/agents/assign";
import { indexAssignmentsByTask, useAgentAssignmentsStore } from "../src/store/agent-assignments-store";
import { createRunStartNoticeStore, useRunStartNoticeStore } from "../src/store/run-start-notice-store";
import type { StateStorage } from "zustand/middleware";
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
  /** Links these turns to the run in this order, as its supervisor records them once each started; the last is the current turn. */
  const link = (...turnIds: string[]) => {
    detail.events = turnIds.map((turnId, index) => ({
      id: `event-${turnId}`, agentRunId: detail.agentRun.id, sequence: index + 1, kind: "turn-linked" as const,
      idempotencyKey: `${detail.agentRun.id}:turn:${index + 1}:linked`, detail: { stageId: "work", attempt: 1, turnId },
      createdAt: detail.agentRun.createdAt,
    }));
  };
  link("turn-run");
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
    expect(contract.where).toBe("billing-fix · stave/billing-fix · its own worktree");
    expect(contract.change).toEqual([
      "Edits files and runs commands. Auto mode decides each action and asks you when it can't.",
      "Always asks first: writes outside the repository, credential files and irreversible remote actions.",
    ]);
    expect(contract.done[0]).toBe("When each of its 3 stages reports done: Work → Review → Fix review findings");
    expect(contract.done).toContain("Stave also runs lint or test before it finishes; one passing script is enough.");
    expect(contract.comesBack).toEqual([
      "Only when it is stuck or needs an answer.",
      "Pauses after 30 turns until you extend it, and at a usage limit.",
    ]);
  });

  test("a read-only agent changes nothing and gets no default check; unknown scripts are said as unknown", () => {
    const readOnly = contractFor(startFor({ name: "Researcher", workflow: undefined, checkIns: undefined, permission: "read-only" }), { permission: "read-only", defaultCheck: { applies: false, scriptIds: null } });
    expect(readOnly.change).toEqual(["Reads files and runs read-only commands; it changes nothing."]);
    expect(readOnly.done.join(" ")).not.toContain("Stave also runs");
    const unknown = contractFor(startFor({ name: "Implementer", workflow: undefined, checkIns: undefined, permission: "manual", reviewBeforeDone: "off" }), { defaultCheck: { applies: true, scriptIds: null } });
    expect(unknown.done).toEqual(["The assignment is complete and verified.", "If the workspace has action scripts, one of them must pass before it finishes."]);
    expect(unknown.change[0]).toBe("Edits files and runs commands without asking.");
    expect(contractFor(startFor({ name: "x", workflow: undefined, checkIns: undefined }), { workspace: { ...workspace, worktree: false, branch: null } }).where).toBe("billing-fix · repository folder");
  });

  test("before a run, Codex Auto does not promise its reviewer: an organization's policy can still turn it off", () => {
    const start = startFor({ name: "Implementer", workflow: undefined, checkIns: undefined, permission: "auto" });
    const unconfirmed = "Edits files and runs commands. Codex's automatic review decides each action and asks you when unsure, unless your organization turns automatic review off; then it edits without asking.";
    expect(contractFor(start, { permission: "auto", providerId: "codex", codexAutoReview: true }).change[0]).toBe(unconfirmed);
    expect(contractFor(start, { permission: "auto", providerId: "codex", codexAutoReview: null }).change[0]).toBe(unconfirmed);
  });

  test("during a run, the line follows the approvals the runtime confirmed for its current turn", () => {
    const start = startFor({ name: "Implementer", workflow: undefined, checkIns: undefined, permission: "auto" });
    const auto = "Edits files and runs commands. Auto mode decides each action and asks you when it can't.";
    // A managed policy turned the reviewer off: the runtime ran the turn with approvals `never`.
    expect(contractFor(start, { permission: "auto", providerId: "codex", codexAutoReview: true, confirmedApprovals: { codexApprovalPolicy: "never", codexApprovalsReviewer: "user" } }).change[0])
      .toBe("Edits files and runs commands without asking: Codex's automatic review is off for this run, so its approvals are off.");
    expect(contractFor(start, { permission: "auto", providerId: "codex", codexAutoReview: true, confirmedApprovals: { codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review" } }).change[0]).toBe(auto);
  });

  test("Auto says what the run applies: a Codex without its reviewer runs with approvals off", () => {
    const start = startFor({ name: "Implementer", workflow: undefined, checkIns: undefined, permission: "auto" });
    const auto = "Edits files and runs commands. Auto mode decides each action and asks you when it can't.";
    // The runtime falls back from on-request + auto_review to `never` when Codex has no reviewer.
    expect(resolveRunApprovalOptions({ providerId: "codex", permission: "auto", codexAutoReview: false })).toMatchObject({ codexApprovalPolicy: "never" });
    expect(contractFor(start, { permission: "auto", providerId: "codex", codexAutoReview: false }).change[0])
      .toBe("Edits files and runs commands without asking: this Codex has no reviewer for Auto, so its approvals are off.");
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
    expect(header([turn({ codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review" })])).toContain("Auto mode decides each action");
  });

  test("a Codex run's header stays unconfirmed until the runtime confirms its current turn's approvals", () => {
    const { header, turn, link } = codexRunHeader();
    const requested = { codexApprovalPolicy: "on-request", codexApprovalsReviewer: "auto_review" };
    // The turn's provenance starts with what it asked for; Codex has not accepted its start yet.
    expect(header([turn(requested, { confirmed: false })])).toContain(unconfirmedAuto);
    // An earlier turn's confirmation says nothing about the turn that is starting now.
    link("turn-1", "turn-2");
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
    expect(header([ownTurn, laterTurn])).toContain("Auto mode decides each action");
    // A turn the run never linked says nothing about it, however recent.
    expect(header([laterTurn])).toContain(unconfirmedAuto);
  });

  test("a run's header waits for its current turn: an earlier turn's confirmation never stands in for it", () => {
    const { header, turn, link } = codexRunHeader();
    const earlier = turn({ codexApprovalPolicy: "never", codexApprovalsReviewer: "user" }, { turnId: "turn-a" });
    link("turn-a");
    expect(header([earlier])).toContain("automatic review is off for this run");
    link("turn-a", "turn-b");
    // Turn B started: its row is there, its provenance has not arrived yet.
    const placeholder = { ...turn({}, { turnId: "turn-b" }), agentProvenance: undefined };
    expect(header([earlier, placeholder])).toContain(unconfirmedAuto);
    // Turn B ended before it sent any provenance (the agent's settings did not validate).
    expect(header([earlier])).toContain(unconfirmedAuto);
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
    for (const label of ["Works in", "Can do", "Done when", "Checks with you"]) expect(html).toContain(label);
    applyAppLocale("ko");
    const korean = renderToStaticMarkup(createElement(AgentRunOverview, { detail, now: NOW.getTime() }));
    expect(korean).toContain("이 실행이 하는 일");
    expect(korean).toContain("확인 요청");
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

describe("run-start line before a send", () => {
  const auto = startFor({ name: "Lead", workflow: undefined, checkIns: undefined, permission: "auto" });

  test("the summary says how far the run acts alone, when it checks in and its turn cap", () => {
    expect(buildRunContractSummary({ workspace, permission: "auto", providerId: "claude-code", workflow: auto.workflow, authorizedEffectStageIds: [], maxTurns: 30 }))
      .toEqual({ permission: { text: "Edits in auto mode", warning: false }, checkIns: "Asks only when stuck", turns: "Up to 30 turns" });
    const manual = buildRunContractSummary({ workspace, permission: "manual", workflow: auto.workflow, authorizedEffectStageIds: [], maxTurns: 1 });
    expect(manual.permission).toEqual({ text: "Edits without asking", warning: true });
    expect(manual.turns).toBe("Up to 1 turn");
    expect(buildRunContractSummary({ workspace, permission: "read-only", workflow: auto.workflow, authorizedEffectStageIds: [], maxTurns: 30 }).permission)
      .toEqual({ text: "Read-only", warning: false });
    // Codex without its reviewer runs with approvals off: said as a warning, like any edit without asking.
    expect(buildRunContractSummary({ workspace, permission: "auto", providerId: "codex", codexAutoReview: false, workflow: auto.workflow, authorizedEffectStageIds: [], maxTurns: 30 }).permission)
      .toEqual({ text: "Edits without asking", warning: true });
    expect(buildRunContractSummary({ workspace, permission: "auto", providerId: "codex", codexAutoReview: true, workflow: auto.workflow, authorizedEffectStageIds: [], maxTurns: 30 }).permission)
      .toEqual({ text: "Edits with Codex review", warning: false });
    const shipper = startFor({ name: "Shipper", workflow: shipWorkflow, checkIns: "plan-and-publishing", permission: "auto" });
    expect(buildRunContractSummary({ workspace, permission: "auto", workflow: shipper.workflow, authorizedEffectStageIds: [], maxTurns: 30 }).checkIns)
      .toBe("Sign-off after planning and before publishing");
    applyAppLocale("ko");
    expect(buildRunContractSummary({ workspace, permission: "auto", providerId: "claude-code", workflow: auto.workflow, authorizedEffectStageIds: [], maxTurns: 30 }))
      .toEqual({ permission: { text: "자동 모드로 편집", warning: false }, checkIns: "막힐 때만 질문", turns: "최대 30턴" });
  });

  test("the draft is read as the send reads it: assignment length with paths, attachments across staged items", () => {
    expect(describeRunStartDraft({ text: "  ", attachedFilePaths: [], attachments: [] }).promptFit).toBe("empty");
    expect(describeRunStartDraft({ text: "Fix it", attachedFilePaths: [], attachments: [] })).toEqual({ promptFit: "fits", filePaths: 0, context: 0 });
    expect(describeRunStartDraft({ text: "x".repeat(AGENT_RUN_LIMITS.maxAssignmentChars + 1), attachedFilePaths: [], attachments: [] }).promptFit).toBe("too-long");
    const draft = describeRunStartDraft({
      text: "Fix it",
      attachedFilePaths: ["a.ts", "b.ts"],
      attachments: [
        { kind: "image", id: "i", name: "shot.png", dataUrl: "data:" },
        { kind: "lens-annotations", id: "l", content: "note" },
      ] as never,
      promptBatch: [{ id: "p", content: "and this", attachedFilePaths: ["a.ts"], attachments: [{ kind: "image", id: "j", name: "x.png", dataUrl: "data:" }] }] as never,
    });
    expect(draft).toEqual({ promptFit: "fits", filePaths: 2, context: 2 });
    // The shelf decides from the measured prompt exactly as the send decides from the prompt.
    for (const prompt of ["", "Fix it", "x".repeat(AGENT_RUN_LIMITS.maxAssignmentChars + 1)]) {
      const base = { taskRunsAsAgent: true, runActive: false, turnActive: false, queued: false, turnOrigin: "conversation" as const, providerId: "codex" };
      expect(planAgentPromptSendForFit({ ...base, promptFit: describeRunStartDraft({ text: prompt, attachedFilePaths: [], attachments: [] }).promptFit }))
        .toEqual(planAgentPromptSend({ ...base, prompt }));
    }
  });

  test("the line names the agent and summarizes; Details opens the contract for every task until closed", () => {
    const lead = getBuiltinAgent("lead")!;
    const row = { id: "a1", taskId: "task", agentConfigId: lead.id, agentName: lead.name, agent: lead, agentContentHash: "h", received: [], support: [], state: "started",
      providerId: "claude-code", model: null, workspaceMode: "same-workspace", branch: null, detail: null, createdAt: "", updatedAt: "" } as unknown as AgentAssignment;
    const assignments = useAgentAssignmentsStore.getInitialState() as unknown as Record<string, unknown>;
    const notice = useRunStartNoticeStore.getInitialState() as unknown as Record<string, unknown>;
    const saved = { byTaskId: assignments.byTaskId, detailsOpen: notice.detailsOpen };
    assignments.byTaskId = indexAssignmentsByTask([row]);
    const render = (open: boolean, attachments = { filePaths: 0, context: 0 }) => {
      notice.detailsOpen = open;
      return withState({ taskWorkspaceIdById: { task: "ws" }, workspaces: [{ id: "ws", name: "billing-fix" }], workspaceBranchById: { ws: "main" } },
        () => renderToStaticMarkup(createElement(RunStartNotice, { taskId: "task", attachments })));
    };
    try {
      const closed = render(false);
      expect(closed).toContain("Send starts Lead");
      expect(closed).toContain("Edits in auto mode");
      expect(closed).toContain('data-details="closed"');
      expect(closed).toContain('aria-expanded="false"');
      expect(closed).not.toContain("Works in");
      const open = render(true, { filePaths: 0, context: 2 });
      expect(open).toContain('aria-expanded="true"');
      expect(open).toContain("Keeps 2 attachments");
      for (const label of ["Can do", "Attachments"]) expect(open).toContain(label);
      // Lead's condition is the default, so there is no Done when row; a stated condition or checks would show one.
      expect(open).not.toContain("Done when");
      expect(open).not.toContain("The assignment is complete and verified.");
      // Only what the line does not say: the workspace is the bar under the composer, the check-in and turn cap are the line.
      for (const repeated of ["Works in", "billing-fix · main", "Checks with you", "Only when it is stuck", "Pauses after 30 turns"]) expect(open).not.toContain(repeated);
      // A check-in that is not "only when stuck" leaves something the line does not say: where questions go.
      assignments.byTaskId = indexAssignmentsByTask([{ ...row, agent: { ...lead, checkIns: "every-stage", workflow: shipWorkflow } } as AgentAssignment]);
      const everyStage = render(true);
      // Stages and checks are more than the default, so Done when shows them.
      expect(everyStage).toContain("Done when");
      expect(everyStage).toContain("Stave runs lint and test itself; every one must pass.");
      expect(everyStage).toContain("Sign-off before each stage");
      expect(everyStage).toContain("Checks with you");
      expect(everyStage).toContain("Questions it cannot settle come to you.");
      assignments.byTaskId = indexAssignmentsByTask([row]);
      // Files attached by path are read from disk: the line says so instead of the turn cap.
      expect(render(false, { filePaths: 1, context: 1 })).toContain("Reads saved copies of attached files");
      applyAppLocale("ko");
      // Named as the composer's agent selector names it, in every language.
      expect(render(false)).toContain("보내면 Lead 실행 시작");
    } finally {
      assignments.byTaskId = saved.byTaskId;
      notice.detailsOpen = saved.detailsOpen;
    }
  });

  test("whether Details is open is remembered across stores and survives a bad saved value", () => {
    const memory = new Map<string, string>();
    const storage: StateStorage = { getItem: (name) => memory.get(name) ?? null, setItem: (name, value) => void memory.set(name, value), removeItem: (name) => void memory.delete(name) };
    const first = createRunStartNoticeStore({ storage });
    expect(first.getState().detailsOpen).toBe(false);
    first.getState().setDetailsOpen(true);
    expect(createRunStartNoticeStore({ storage }).getState().detailsOpen).toBe(true);
    first.getState().setDetailsOpen(false);
    expect(createRunStartNoticeStore({ storage }).getState().detailsOpen).toBe(false);
    memory.set("stave:run-start-notice", "{not json");
    expect(createRunStartNoticeStore({ storage }).getState().detailsOpen).toBe(false);
    memory.set("stave:run-start-notice", JSON.stringify({ state: { detailsOpen: "yes" }, version: 0 }));
    expect(createRunStartNoticeStore({ storage }).getState().detailsOpen).toBe(false);
  });
});
