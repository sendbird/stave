import { snapshotProviderAccounts } from "../../src/lib/providers/provider-account-selection";
import type { RateLimitsSnapshotResponse } from "../../src/lib/providers/provider.types";
import { summarizeProviderUsage } from "./supervision/provider-usage-context";
import { tarsExecutionTarget } from "../../src/lib/tars/execution-resources";
import type { TarsMessage } from "../../src/lib/tars/conversation";

/** New work can choose its provider; an admitted Run keeps its account/session. */
export async function routeTarsExecution(message: Pick<TarsMessage, "providerId" | "executionModel" | "runtimeHints">, ports: {
  read: (accounts: ReturnType<typeof snapshotProviderAccounts>) => Promise<RateLimitsSnapshotResponse>;
  now?: () => number;
  keepProvider?: boolean;
}) {
  const target = tarsExecutionTarget(message);
  const accounts = snapshotProviderAccounts(message.runtimeHints);
  const snapshot = await ports.read(accounts).catch(() => null);
  const now = (ports.now ?? Date.now)();
  const usage = (providerId: "claude-code" | "codex") => summarizeProviderUsage({ providerId, now,
    observation: snapshot ? { snapshot, metadata: { observedAt: new Date(now).toISOString() } } : null });
  const other = target.providerId === "codex" ? "claude-code" : "codex";
  const current = usage(target.providerId), alternative = usage(other);
  const knownRoom = alternative.status === "headroom" || alternative.status === "low";
  const switchProvider = !message.executionModel && !ports.keepProvider && knownRoom &&
    (current.status === "exhausted" || current.status === "critical" || current.status === "unknown" || current.status === "low" && alternative.status === "headroom");
  const providerId = switchProvider ? other : target.providerId;
  return { providerId, model: target.model, runtimeHints: { ...message.runtimeHints, ...accounts } };
}

/** All work units from one decision share its account reads, not repeated network probes. */
export function createTarsExecutionRouter(ports: {
  read: (accounts: ReturnType<typeof snapshotProviderAccounts>) => Promise<RateLimitsSnapshotResponse>;
  fixedAgent: (id: string) => boolean;
}) {
  const readings = new Map<string, Promise<RateLimitsSnapshotResponse>>();
  return (message: Parameters<typeof routeTarsExecution>[0], agentId?: string) => routeTarsExecution(message, {
    keepProvider: Boolean(agentId && ports.fixedAgent(agentId)),
    read: accounts => {
      const key = JSON.stringify(accounts);
      let reading = readings.get(key);
      if (!reading) { reading = ports.read(accounts); readings.set(key, reading); }
      return reading;
    },
  });
}
