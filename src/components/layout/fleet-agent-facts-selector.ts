import { buildFleetAgentFacts, shareFleetAgentFacts, type FleetAgentFacts } from "@/lib/fleet/agent-tree";
import type { FleetTaskRow } from "@/lib/fleet/task-rows";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import type { AppState } from "@/store/app-store.types";
import type { ChatMessage } from "@/types/chat";

/** Cache each row's inputs, not just its output: unrelated chunks do no work. */
export function createFleetAgentFactsSelector(rows: readonly FleetTaskRow[]) {
  const cache = new Map<string, {
    activity: ProviderTurnActivitySnapshot | null;
    messages: ChatMessage[] | undefined;
    facts: FleetAgentFacts;
  }>();
  let previous: Readonly<Record<string, FleetAgentFacts>> = {};
  let previousState: AppState | undefined;
  return (state: AppState) => {
    if (state === previousState) return previous;
    const next: Record<string, FleetAgentFacts> = {};
    for (const row of rows) {
      const snapshot = row.activeTurnId ? state.providerTurnActivityByTask[row.task.id] : undefined;
      const activity = snapshot && snapshot.turnId === row.activeTurnId ? snapshot : null;
      const messages = row.repositoryPath !== state.repositoryPath
        ? undefined
        : row.workspaceId === state.activeWorkspaceId
          ? state.messagesByTask[row.task.id]
          : state.workspaceRuntimeCacheById[row.workspaceId]?.messagesByTask[row.task.id];
      const cached = cache.get(row.key);
      const facts = cached && cached.activity === activity && cached.messages === messages
        ? cached.facts
        : buildFleetAgentFacts({ activity, messages });
      cache.set(row.key, { activity, messages, facts });
      next[row.key] = facts;
    }
    previous = shareFleetAgentFacts(previous, next);
    previousState = state;
    return previous;
  };
}
