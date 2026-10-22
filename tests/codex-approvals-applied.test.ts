import { describe, expect, test } from "bun:test";
import { prepareTaskAgentTurn } from "../electron/providers/task-agent-turn";
import type { BridgeEvent } from "../electron/providers/types";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { compileTaskAgentRole } from "@/lib/agents/runtime-options";
import type { AgentAssignment } from "@/lib/agents/assign";
import { AgentTurnProvenanceSchema, withConfirmedApprovals } from "@/lib/agents/turn-provenance";
import { buildCodexApprovalsAppliedEvent } from "@/lib/providers/codex-runtime-options";
import type { NormalizedProviderEvent } from "@/lib/providers/provider.types";
import { NormalizedProviderEventSchema } from "@/lib/providers/schemas";
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";

const requested = { codexApprovalPolicy: "on-request" as const, codexApprovalsReviewer: "auto_review" as const };

/** A Codex Auto turn of the Implementer agent, as the provider runtime prepares it. */
function agentTurn(turnId = "turn-1") {
  const agent = { ...getBuiltinAgent("implementer")!, permission: "auto" as const };
  const compiled = compileTaskAgentRole({ agent, providerId: "codex", standards: null, role: "primary" });
  const assignment = {
    id: "assignment-1", agentConfigId: compiled.agentConfigId, agentName: agent.name, agent, agentContentHash: compiled.contentHash,
    role: "primary", providerId: "codex", model: null, standards: null, received: [], support: [], state: "started",
  } as unknown as AgentAssignment;
  return prepareTaskAgentTurn({
    turn: { providerId: "codex", turnId, taskId: "task-1", prompt: "Work", cwd: "/tmp/repo", runtimeOptions: requested } as never,
    assignment, hasDelivery: () => false, recordDelivery: () => {},
  });
}

/** The events a turn stream carries, as the provider runtime emits them: its provenance, then each event after the provenance it re-states. */
function streamOf(turn: ReturnType<typeof agentTurn>, events: BridgeEvent[]): NormalizedProviderEvent[] {
  const stream: BridgeEvent[] = [{ type: "agent_provenance", provenance: turn.provenance }];
  for (const event of events) {
    const restated = turn.observe(event);
    if (restated) stream.push(restated);
    stream.push(event);
  }
  return stream as NormalizedProviderEvent[];
}

const replayed = (events: NormalizedProviderEvent[]) =>
  replayProviderEventsToTaskState({ taskId: "task-1", provider: "codex", model: "gpt", turnId: "turn-1", events, messages: [] })
    .messages.find((message) => message.role === "assistant")?.agentProvenance;

describe("approvals a Codex turn applied", () => {
  test("the event parses as a normalized provider event", () => {
    expect(NormalizedProviderEventSchema.safeParse({ type: "approvals_applied", codexApprovalPolicy: "never", codexApprovalsReviewer: "user" }).success).toBe(true);
    expect(NormalizedProviderEventSchema.safeParse({ type: "approvals_applied", codexApprovalPolicy: "on-request" }).success).toBe(true);
    expect(NormalizedProviderEventSchema.safeParse({ type: "approvals_applied", codexApprovalPolicy: "sometimes" }).success).toBe(false);
  });

  test("a turn that asked for the reviewer reports what it runs with; any other turn reports nothing", () => {
    // A managed policy forbids auto_review: the runtime falls back to `never`.
    expect(buildCodexApprovalsAppliedEvent({ requested, effective: { codexApprovalPolicy: "never", codexApprovalsReviewer: "user" } }))
      .toEqual({ type: "approvals_applied", codexApprovalPolicy: "never", codexApprovalsReviewer: "user" });
    expect(buildCodexApprovalsAppliedEvent({ requested, effective: requested })).toEqual({ type: "approvals_applied", ...requested });
    expect(buildCodexApprovalsAppliedEvent({ requested: { codexApprovalPolicy: "never" }, effective: { codexApprovalPolicy: "never" } })).toBeNull();
  });

  test("the turn's provenance records the confirmed approvals in place of the requested ones, and that they were confirmed", () => {
    const provenance = AgentTurnProvenanceSchema.parse({
      version: 1, turnId: "turn-1", assignmentId: "a", agentConfigId: "implementer", agentName: "Implementer", agentContentHash: "h",
      role: "primary", providerId: "codex", model: null, effort: null,
      permission: { source: "agent-autonomy", agentLimit: "auto", support: "enforced", applied: { ...requested, codexFileAccess: "workspace-write" } },
      instructions: { channel: "instruction", status: "configured" },
    });
    // Until the runtime confirms, the values are only what the turn asked for.
    expect(provenance.permission.approvalsConfirmed).toBeUndefined();
    const confirmed = withConfirmedApprovals(provenance, { codexApprovalPolicy: "never", codexApprovalsReviewer: "user" });
    expect(confirmed.permission).toMatchObject({
      approvalsConfirmed: true,
      applied: { codexFileAccess: "workspace-write", codexApprovalPolicy: "never", codexApprovalsReviewer: "user" },
    });
    expect(AgentTurnProvenanceSchema.parse(confirmed)).toEqual(confirmed);
    expect(withConfirmedApprovals(provenance, { codexApprovalPolicy: "never" }).permission.applied)
      .toEqual({ codexFileAccess: "workspace-write", codexApprovalPolicy: "never" });
  });

  test("an Agent turn re-states its provenance when the runtime reports the approvals it applied", () => {
    const turn = agentTurn();
    expect(turn.provenance.permission.approvalsConfirmed).toBeUndefined();
    const restated = turn.observe({ type: "approvals_applied", codexApprovalPolicy: "never", codexApprovalsReviewer: "user" } satisfies BridgeEvent);
    expect(restated).toMatchObject({ type: "agent_provenance", provenance: { turnId: "turn-1", permission: { approvalsConfirmed: true, applied: { codexApprovalPolicy: "never", codexApprovalsReviewer: "user" } } } });
  });

  test("replay stores the approvals the runtime confirmed on the turn's message", () => {
    const turn = agentTurn();
    const stored = replayed(streamOf(turn, [
      { type: "provider_turn", providerId: "codex", nativeSessionId: "thread-1", nativeTurnId: "native-1" },
      // A managed policy dropped the reviewer: Codex accepted the turn with approvals `never`.
      { type: "approvals_applied", codexApprovalPolicy: "never", codexApprovalsReviewer: "user" },
      { type: "text", text: "Working on it." },
      { type: "done" },
    ]));
    expect(stored?.permission).toMatchObject({ approvalsConfirmed: true, applied: { codexApprovalPolicy: "never", codexApprovalsReviewer: "user" } });
    // Delivery still advances, and nothing else of the recorded configuration changed.
    expect(stored?.instructions.status).toBe("delivered");
    expect(stored?.permission.applied).toMatchObject({ codexFileAccess: turn.provenance.permission.applied.codexFileAccess });
  });

  test("replay keeps the requested approvals unconfirmed until the runtime confirms them", () => {
    const stored = replayed(streamOf(agentTurn(), [{ type: "text", text: "Working on it." }]));
    expect(stored?.permission.approvalsConfirmed).toBeUndefined();
    expect(stored?.permission.applied).toMatchObject(requested);
  });

  test("replay takes confirmed approvals only from the same turn and assignment, and never un-confirms them", () => {
    const turn = agentTurn();
    const [initial] = streamOf(turn, []);
    const confirmed = turn.observe({ type: "approvals_applied", codexApprovalPolicy: "never", codexApprovalsReviewer: "user" }) as Extract<NormalizedProviderEvent, { type: "agent_provenance" }>;
    const other = (patch: Record<string, string>) => ({ ...confirmed, provenance: { ...confirmed.provenance, ...patch } });
    // Another turn's, another assignment's or another agent version's confirmation is not this turn's.
    for (const patch of [{ turnId: "turn-2" }, { assignmentId: "assignment-2" }, { agentContentHash: "other" }]) {
      expect(replayed([initial!, other(patch)])?.permission.approvalsConfirmed).toBeUndefined();
    }
    // A later re-statement without the confirmation does not take it back.
    expect(replayed([initial!, confirmed, initial!])?.permission).toMatchObject({ approvalsConfirmed: true, applied: { codexApprovalPolicy: "never" } });
  });
});
