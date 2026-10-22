import { describe, expect, test } from "bun:test";
import { prepareTaskAgentTurn } from "../electron/providers/task-agent-turn";
import type { BridgeEvent } from "../electron/providers/types";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { compileTaskAgentRole } from "@/lib/agents/runtime-options";
import type { AgentAssignment } from "@/lib/agents/assign";
import { AgentTurnProvenanceSchema, withConfirmedApprovals } from "@/lib/agents/turn-provenance";
import { buildCodexApprovalsAppliedEvent } from "@/lib/providers/codex-runtime-options";
import { NormalizedProviderEventSchema } from "@/lib/providers/schemas";

const requested = { codexApprovalPolicy: "on-request" as const, codexApprovalsReviewer: "auto_review" as const };

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
    const agent = { ...getBuiltinAgent("implementer")!, permission: "auto" as const };
    const compiled = compileTaskAgentRole({ agent, providerId: "codex", standards: null, role: "primary" });
    const assignment = {
      id: "assignment-1", agentConfigId: compiled.agentConfigId, agentName: agent.name, agent, agentContentHash: compiled.contentHash,
      role: "primary", providerId: "codex", model: null, standards: null, received: [], support: [], state: "started",
    } as unknown as AgentAssignment;
    const turn = prepareTaskAgentTurn({
      turn: { providerId: "codex", turnId: "turn-1", taskId: "task-1", prompt: "Work", cwd: "/tmp/repo", runtimeOptions: requested } as never,
      assignment, hasDelivery: () => false, recordDelivery: () => {},
    });
    expect(turn.provenance.permission.approvalsConfirmed).toBeUndefined();
    const restated = turn.observe({ type: "approvals_applied", codexApprovalPolicy: "never", codexApprovalsReviewer: "user" } satisfies BridgeEvent);
    expect(restated).toMatchObject({ type: "agent_provenance", provenance: { turnId: "turn-1", permission: { approvalsConfirmed: true, applied: { codexApprovalPolicy: "never", codexApprovalsReviewer: "user" } } } });
  });
});
