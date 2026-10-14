import { collectProviderAccountUsageWindows, resolveAccountUsageBlock } from "../../../src/lib/providers/account-usage-block";
import { selectedProviderAccount, type ProviderAccountSelection } from "../../../src/lib/providers/provider-account-selection";
import type { ProviderRuntimeOptions, RateLimitsSnapshotResponse } from "../../../src/lib/providers/provider.types";
import type { z } from "zod";
import { AgentRunFingerprintSchema, type AgentRunAggregate, type AgentRunEvent, type AgentRunFingerprint } from "../../../src/lib/agent-runs/domain";
import { AdaptiveRoutingIntentSchema } from "../../../src/lib/agent-runs/resources";
import type { AgentRunObservation } from "../../../src/lib/agent-runs/policy";

const TurnEffortSchema = AdaptiveRoutingIntentSchema.pick({ claudeEffort: true, codexReasoningEffort: true });
export type AgentRunTurnEffort = z.infer<typeof TurnEffortSchema>;

/** The effort a run turn passed to its provider, as its `turn-linked` event records it; empty when it set none. */
export function turnEffortOf(runtimeOptions: ProviderRuntimeOptions): AgentRunTurnEffort {
  return {
    ...(runtimeOptions.claudeEffort ? { claudeEffort: runtimeOptions.claudeEffort } : {}),
    ...(runtimeOptions.codexReasoningEffort ? { codexReasoningEffort: runtimeOptions.codexReasoningEffort } : {}),
  };
}

/**
 * The effort the usage-limited turn ran with. A turn linked before effort was
 * recorded, or one the user started, reads as empty: the task's own effort applies.
 */
export function usageLimitedTurnEffort(events: AgentRunEvent[], turnId: string): AgentRunTurnEffort {
  const linked = [...events].reverse().find((event) => event.kind === "turn-linked" && event.detail.turnId === turnId);
  const stored = TurnEffortSchema.safeParse(linked?.detail.effort);
  return stored.success ? stored.data : {};
}

export function usageLimitedTurnRuntime(args: {
  aggregate: AgentRunAggregate; events: AgentRunEvent[]; turnId: string;
  accounts: ProviderAccountSelection; accountProfileId?: string;
}) {
  const linked = [...args.events].reverse().find((event) => event.kind === "turn-linked" && event.detail.turnId === args.turnId);
  const started = linked ? [...args.events].reverse().find((event) => event.kind === "turn-started" && event.sequence < linked.sequence) : undefined;
  const stored = AgentRunFingerprintSchema.safeParse(started?.detail.fingerprint);
  const fingerprint = stored.success ? stored.data : args.aggregate.agentRun.fingerprint;
  return { fingerprint, accountProfileId: args.accountProfileId ??
    (typeof started?.detail.accountProfileId === "string" ? started.detail.accountProfileId : selectedProviderAccount(fingerprint.providerId, args.accounts)) };
}

export function usageLimitAccounts(fingerprint: AgentRunFingerprint, accountProfileId: string, accounts: ProviderAccountSelection): ProviderAccountSelection {
  return { ...accounts, ...(fingerprint.providerId === "codex" ? { codexAccountProfileId: accountProfileId }
    : fingerprint.providerId === "claude-code" ? { claudeAccountProfileId: accountProfileId } : {}) };
}

export function observeUsageLimitQuota(fingerprint: AgentRunFingerprint, snapshot: RateLimitsSnapshotResponse | null, now: Date): NonNullable<AgentRunObservation["usageLimitResume"]> {
  const feedback = snapshot?.reads?.[fingerprint.providerId];
  if (feedback?.lastReadFailed || feedback?.status === "unavailable") return { status: "unavailable" };
  const windows = collectProviderAccountUsageWindows({ providerId: fingerprint.providerId, model: fingerprint.model, snapshot });
  if (windows === null) return { status: "unavailable" };
  const block = resolveAccountUsageBlock({ providerId: fingerprint.providerId, model: fingerprint.model, snapshot, now: now.getTime() });
  if (!block) return { status: "headroom" };
  return { status: "exhausted", ...(block.resetsAt != null ? { resetsAt: new Date(block.resetsAt * 1000).toISOString() } : {}) };
}
